import express from 'express';
import type { Request, Response } from 'express';
import Document from '../models/Document.js';
import Project from '../models/Project.js';
import User from '../models/User.js';
import GoogleService from '../services/GoogleService.js';

const router = express.Router();

// Get all documents for a project
router.get('/project/:projectId', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const { projectId } = req.params;
      const userId = req.headers['user-id'] as string;

      // Verify project access
      const project = await Project.findById(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Optional: Check project ownership/permissions
      if (project.owner.toString() !== userId) {
        return res.status(403).json({ error: 'Not authorized to access this project' });
      }

      const documents = await Document.find({ project: projectId });
      return res.json(documents);
    } catch (error) {
      console.error('Error fetching documents:', error);
      return res.status(500).json({ error: 'Failed to fetch documents' });
    }
  };
  
  handleRequest();
});

// Create new document
router.post('/', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const { title, documentType, parentId, projectId, synopsis } = req.body;
      const userId = req.headers['user-id'] as string;

      if (!title || !documentType || !projectId) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const project = await Project.findById(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Check project ownership
      if (project.owner.toString() !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (!user.accessToken || !user.refreshToken) {
        return res.status(400).json({ error: 'Missing authentication tokens' });
      }

      const googleService = new GoogleService(user.accessToken, user.refreshToken);

      // Find parent folder ID in Google Drive
      let parentFolderId = project.rootFolderId;
      if (parentId) {
        const parentDoc = await Document.findById(parentId);
        if (parentDoc) {
          parentFolderId = parentDoc.googleDriveId || project.rootFolderId;
        }
      }
      
      // Convert null to undefined to match createFolder parameter type
      const safeParentFolderId = parentFolderId ?? undefined;

      // Initialize document IDs
      let googleDriveId = '';
      let googleDocId = '';

      try {
        if (documentType === 'folder') {
          googleDriveId = await googleService.createFolder(title, safeParentFolderId);
        } else {
          const docInfo = await googleService.createDocument(title, safeParentFolderId);
          googleDriveId = docInfo.driveId;
          googleDocId = docInfo.docId;
        }
      } catch (googleError) {
        console.error('Google API error:', googleError);
        return res.status(500).json({ error: 'Failed to create document in Google Drive' });
      }

      // Get existing docs count for ordering
      const siblingDocsCount = await Document.countDocuments({
        project: projectId,
        parent: parentId || null
      });

      // Create document in database
      const document = await Document.create({
        title,
        documentType,
        parent: parentId || null,
        project: projectId,
        googleDocId,
        googleDriveId,
        synopsis,
        order: siblingDocsCount,
      });

      return res.status(201).json(document);
    } catch (error) {
      console.error('Document creation error:', error);
      return res.status(500).json({ error: 'Failed to create document' });
    }
  };
  
  handleRequest();
});

// Get document content
router.get('/:id/content', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const { id } = req.params;
      const userId = req.headers['user-id'] as string;

      if (!id) {
        return res.status(400).json({ error: 'Document ID is required' });
      }

      const document = await Document.findById(id);
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      if (!document.googleDocId) {
        return res.status(400).json({ error: 'Document does not have a Google Doc ID' });
      }

      // Check project access
      const project = await Project.findById(document.project);
      if (!project) {
        return res.status(404).json({ error: 'Associated project not found' });
      }
      
      if (project.owner.toString() !== userId) {
        return res.status(403).json({ error: 'Not authorized to access this document' });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (!user.accessToken || !user.refreshToken) {
        return res.status(400).json({ error: 'Missing authentication tokens' });
      }

      const googleService = new GoogleService(user.accessToken, user.refreshToken);

      try {
        const content = await googleService.getDocumentContent(document.googleDocId);
        return res.json(content);
      } catch (googleError) {
        console.error('Google API error:', googleError);
        return res.status(500).json({ error: 'Failed to fetch document from Google Docs' });
      }
    } catch (error) {
      console.error('Fetch document content error:', error);
      return res.status(500).json({ error: 'Failed to fetch document content' });
    }
  };
  
  handleRequest();
});

// Update document metadata
router.patch('/:id', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const { id } = req.params;
      const userId = req.headers['user-id'] as string;
      const { title, synopsis, metadata } = req.body;

      const document = await Document.findById(id);
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // Check project access
      const project = await Project.findById(document.project);
      if (!project) {
        return res.status(404).json({ error: 'Associated project not found' });
      }
      
      if (project.owner.toString() !== userId) {
        return res.status(403).json({ error: 'Not authorized to modify this document' });
      }

      // Update document fields
      if (title !== undefined) document.title = title;
      if (synopsis !== undefined) document.synopsis = synopsis;
      if (metadata !== undefined) {
        document.metadata = {
          ...document.metadata,
          ...metadata
        };
      }

      await document.save();
      return res.json(document);
    } catch (error) {
      console.error('Update document error:', error);
      return res.status(500).json({ error: 'Failed to update document' });
    }
  };
  
  handleRequest();
});

// Delete document
router.delete('/:id', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const { id } = req.params;
      const userId = req.headers['user-id'] as string;

      const document = await Document.findById(id);
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // Check project access
      const project = await Project.findById(document.project);
      if (!project) {
        return res.status(404).json({ error: 'Associated project not found' });
      }
      
      if (project.owner.toString() !== userId) {
        return res.status(403).json({ error: 'Not authorized to delete this document' });
      }

      // Delete from Google Drive if needed
      if (document.googleDriveId) {
        const user = await User.findById(userId);
        if (user && user.accessToken && user.refreshToken) {
          try {
            const googleService = new GoogleService(user.accessToken, user.refreshToken);
            await googleService.deleteFile(document.googleDriveId);
          } catch (googleError) {
            console.error('Failed to delete from Google Drive:', googleError);
            // Continue with local deletion even if Google Drive deletion fails
          }
        }
      }

      await Document.findByIdAndDelete(id);
      return res.json({ success: true, message: 'Document deleted successfully' });
    } catch (error) {
      console.error('Delete document error:', error);
      return res.status(500).json({ error: 'Failed to delete document' });
    }
  };
  
  handleRequest();
});

export default router;