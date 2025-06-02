import express from 'express';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';

// Import models with explicit typing to avoid Router conflicts
const Document = mongoose.model('Document');
const Project = mongoose.model('Project');
const User = mongoose.model('User');

import GoogleService from '../services/GoogleService.js';

const router = express.Router();

// Get all documents for a project - READS FROM JSON FILES
router.get('/project/:projectId', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const { projectId } = req.params;
      const userId = req.headers['user-id'] as string;

      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }

      const project = await Project.findById(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      if (project.owner.toString() !== userId) {
        return res.status(403).json({ error: 'Not authorized to access this project' });
      }

      const user = await User.findById(userId);
      if (!user?.accessToken || !user?.refreshToken) {
        return res.status(400).json({ error: 'Missing authentication tokens' });
      }

      const googleService = new GoogleService(user.accessToken, user.refreshToken, userId, user.email);
      const documents = await googleService.getDocuments(project.rootFolderId);

      console.log(`📄 Retrieved ${documents.length} documents from JSON index`);
      return res.json(documents);
    } catch (error) {
      console.error('Error fetching documents:', error);
      return res.status(500).json({ error: 'Failed to fetch documents' });
    }
  };
  
  handleRequest();
});

// Create new document - SAVES TO JSON FILES WITH PROPER PARENT HANDLING
router.post('/', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const { title, documentType, parentId, projectId, synopsis } = req.body;
      const userId = req.headers['user-id'] as string;

      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }

      if (!title || !documentType || !projectId) {
        return res.status(400).json({ error: 'Missing required fields: title, documentType, projectId' });
      }

      const project = await Project.findById(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      if (project.owner.toString() !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const user = await User.findById(userId);
      if (!user?.accessToken || !user?.refreshToken) {
        return res.status(400).json({ error: 'Missing authentication tokens' });
      }

      const googleService = new GoogleService(user.accessToken, user.refreshToken, userId, user.email);

      // FIXED: Proper parent folder ID resolution
      let actualParentFolderId = project.rootFolderId; // Default to project root
      let documentParentId: string | undefined = undefined; // For JSON index

      if (parentId && parentId !== 'root') {
        // Get current documents to find the parent
        const documents = await googleService.getDocuments(project.rootFolderId);
        const parentDoc = documents.find(doc => doc.id === parentId);
        
        if (parentDoc) {
          // Check if parent is a folder type that can contain documents
          if (['folder', 'chapter', 'part'].includes(parentDoc.documentType)) {
            actualParentFolderId = parentDoc.id; // Use the Google Drive ID directly
            documentParentId = parentId; // Track in JSON index
            console.log(`📁 Creating "${title}" in folder "${parentDoc.title}" (${parentId})`);
          } else {
            // Parent is not a folder - use its parent instead
            if (parentDoc.parentId) {
              const grandParent = documents.find(doc => doc.id === parentDoc.parentId);
              if (grandParent && ['folder', 'chapter', 'part'].includes(grandParent.documentType)) {
                actualParentFolderId = grandParent.id;
                documentParentId = parentDoc.parentId;
                console.log(`📁 Creating "${title}" alongside "${parentDoc.title}" in "${grandParent.title}"`);
              }
            }
            // If no suitable parent found, will use project root (already set above)
          }
        }
      }

      console.log(`📝 Creating ${documentType} "${title}" in Google Drive folder: ${actualParentFolderId}`);

      // Create the document with the correct parent folder ID
      const { driveId, metadata } = await googleService.createDocument(
        project.rootFolderId,
        title,
        actualParentFolderId, // This is the actual Google Drive folder ID
        documentType
      );

      // Update the metadata with the correct parentId for the JSON index
      if (documentParentId) {
        metadata.parentId = documentParentId;
      }

      // Optionally cache in MongoDB for search/performance
      try {
        await Document.create({
          project: projectId,
          googleDriveId: driveId,
          title,
          documentType,
          parentGoogleId: documentParentId,
          order: metadata.order,
          lastSyncedAt: new Date(),
        });
        console.log(`💾 Cached document in MongoDB: ${title}`);
      } catch (cacheError) {
        console.warn('Failed to cache document in MongoDB (non-critical):', cacheError);
      }

      console.log(`✅ Created ${documentType} "${title}" with proper parent structure`);
      return res.status(201).json(metadata);
    } catch (error) {
      console.error('Document creation error:', error);
      return res.status(500).json({ error: 'Failed to create document' });
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
      const { title, synopsis, metadata: metadataUpdates } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }

      // Find project that contains this document
      const cachedDoc = await Document.findOne({ googleDriveId: id });
      let project: any = null;

      if (cachedDoc) {
        project = await Project.findById(cachedDoc.project);
      } else {
        // Search through user's projects
        const userProjects = await Project.find({ owner: userId });
        for (const proj of userProjects) {
          const user = await User.findById(userId);
          if (user?.accessToken && user?.refreshToken) {
            try {
              const googleService = new GoogleService(user.accessToken, user.refreshToken, userId, user.email);
              const projDocuments = await googleService.getDocuments(proj.rootFolderId);
              if (projDocuments.some(doc => doc.id === id)) {
                project = proj;
                break;
              }
            } catch (error) {
              console.warn(`Failed to check project ${proj._id} for document ${id}`);
            }
          }
        }
      }

      if (!project) {
        return res.status(404).json({ error: 'Document not found or access denied' });
      }

      if (project.owner.toString() !== userId) {
        return res.status(403).json({ error: 'Not authorized to update this document' });
      }

      const user = await User.findById(userId);
      if (!user?.accessToken || !user?.refreshToken) {
        return res.status(400).json({ error: 'Missing authentication tokens' });
      }

      const googleService = new GoogleService(user.accessToken, user.refreshToken, userId, user.email);

      // Prepare updates object
      const updates: any = {};
      if (title !== undefined) updates.title = title;
      if (synopsis !== undefined) updates.synopsis = synopsis;
      if (metadataUpdates !== undefined) {
        updates.status = metadataUpdates.status;
        updates.tags = metadataUpdates.tags;
        updates.includeInCompile = metadataUpdates.includeInCompile;
        updates.customFields = metadataUpdates.customFields;
      }

      const updatedDocument = await googleService.updateDocument(project.rootFolderId, id, updates);

      console.log(`📝 Updated document metadata: ${id}`);
      return res.json(updatedDocument);
    } catch (error) {
      console.error('Update document error:', error);
      return res.status(500).json({ error: 'Failed to update document' });
    }
  };
  
  handleRequest();
});

// Move document to new parent
router.patch('/:id/move', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const { id } = req.params;
      const userId = req.headers['user-id'] as string;
      const { newParentId } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }

      // Find project that contains this document
      const cachedDoc = await Document.findOne({ googleDriveId: id });
      let project: any = null;

      if (cachedDoc) {
        project = await Project.findById(cachedDoc.project);
      } else {
        // Search through user's projects
        const userProjects = await Project.find({ owner: userId });
        for (const proj of userProjects) {
          const user = await User.findById(userId);
          if (user?.accessToken && user?.refreshToken) {
            try {
              const googleService = new GoogleService(user.accessToken, user.refreshToken, userId, user.email);
              const projDocuments = await googleService.getDocuments(proj.rootFolderId);
              if (projDocuments.some(doc => doc.id === id)) {
                project = proj;
                break;
              }
            } catch (error) {
              console.warn(`Failed to check project ${proj._id} for document ${id}`);
            }
          }
        }
      }

      if (!project) {
        return res.status(404).json({ error: 'Document not found or access denied' });
      }

      if (project.owner.toString() !== userId) {
        return res.status(403).json({ error: 'Not authorized to move this document' });
      }

      const user = await User.findById(userId);
      if (!user?.accessToken || !user?.refreshToken) {
        return res.status(400).json({ error: 'Missing authentication tokens' });
      }

      const googleService = new GoogleService(user.accessToken, user.refreshToken, userId, user.email);

      // Get current documents to validate the move
      const documents = await googleService.getDocuments(project.rootFolderId);
      const documentToMove = documents.find(doc => doc.id === id);
      
      if (!documentToMove) {
        return res.status(404).json({ error: 'Document not found in project' });
      }

      // Validate new parent
      let newActualParentId = project.rootFolderId; // Default to project root
      let newDocumentParentId: string | undefined = undefined;

      if (newParentId && newParentId !== 'root') {
        const newParent = documents.find(doc => doc.id === newParentId);
        if (newParent && ['folder', 'chapter', 'part'].includes(newParent.documentType)) {
          newActualParentId = newParent.id;
          newDocumentParentId = newParentId;
        } else {
          return res.status(400).json({ error: 'Invalid parent - must be a folder, chapter, or part' });
        }
      }

      // Prevent moving a folder into itself or its descendants
      if (documentToMove.documentType === 'folder') {
        const isDescendant = (checkParentId: string, targetId: string): boolean => {
          const children = documents.filter(doc => doc.parentId === targetId);
          for (const child of children) {
            if (child.id === checkParentId) return true;
            if (child.documentType === 'folder' && isDescendant(checkParentId, child.id)) return true;
          }
          return false;
        };

        if (newDocumentParentId && (newDocumentParentId === id || isDescendant(newDocumentParentId, id))) {
          return res.status(400).json({ error: 'Cannot move folder into itself or its descendants' });
        }
      }

      // Update the document in JSON index
      const updatedDocument = await googleService.updateDocument(project.rootFolderId, id, {
        parentId: newDocumentParentId
      });

      // Also move in Google Drive if it's an actual file/folder
      try {
        // Get the current file info
        const drive = googleService.drive;
        const fileInfo = await drive.files.get({
          fileId: id,
          fields: 'parents'
        });

        // Update the file's parent in Google Drive
        const previousParents = fileInfo.data.parents?.join(',');
        await drive.files.update({
          fileId: id,
          addParents: newActualParentId,
          removeParents: previousParents,
          fields: 'id, parents'
        });

        console.log(`📁 Moved document "${documentToMove.title}" to new parent in both JSON index and Google Drive`);
      } catch (driveError) {
        console.warn('Failed to move in Google Drive (non-critical):', driveError);
      }

      console.log(`✅ Moved document "${documentToMove.title}" to new parent`);
      return res.json(updatedDocument);
    } catch (error) {
      console.error('Move document error:', error);
      return res.status(500).json({ error: 'Failed to move document' });
    }
  };
  
  handleRequest();
});

// Check if document can be deleted
router.get('/:id/can-delete', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const { id } = req.params;
      const userId = req.headers['user-id'] as string;

      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }

      // Find project that contains this document
      const cachedDoc = await Document.findOne({ googleDriveId: id });
      let project: any = null;
      let documents: any[] = [];

      if (cachedDoc) {
        project = await Project.findById(cachedDoc.project);
      } else {
        // Search through user's projects
        const userProjects = await Project.find({ owner: userId });
        for (const proj of userProjects) {
          const user = await User.findById(userId);
          if (user?.accessToken && user?.refreshToken) {
            try {
              const googleService = new GoogleService(user.accessToken, user.refreshToken, userId, user.email);
              const projDocuments = await googleService.getDocuments(proj.rootFolderId);
              if (projDocuments.some(doc => doc.id === id)) {
                project = proj;
                documents = projDocuments;
                break;
              }
            } catch (error) {
              console.warn(`Failed to check project ${proj._id} for document ${id}`);
            }
          }
        }
      }

      if (!project) {
        return res.status(404).json({ error: 'Document not found or access denied' });
      }

      if (project.owner.toString() !== userId) {
        return res.status(403).json({ error: 'Not authorized to access this document' });
      }

      const user = await User.findById(userId);
      if (!user?.accessToken || !user?.refreshToken) {
        return res.status(400).json({ error: 'Missing authentication tokens' });
      }

      if (documents.length === 0) {
        const googleService = new GoogleService(user.accessToken, user.refreshToken, userId, user.email);
        documents = await googleService.getDocuments(project.rootFolderId);
      }

      const targetDoc = documents.find(doc => doc.id === id);
      if (!targetDoc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // Check if it's a folder with children
      const children = documents.filter(doc => doc.parentId === id);
      const canDelete = children.length === 0 || targetDoc.documentType !== 'folder';

      return res.json({
        canDelete,
        childCount: children.length,
        children: children.map(child => ({
          id: child.id,
          title: child.title,
          type: child.documentType
        })),
        document: {
          id: targetDoc.id,
          title: targetDoc.title,
          type: targetDoc.documentType
        }
      });
    } catch (error) {
      console.error('Can delete check error:', error);
      return res.status(500).json({ error: 'Failed to check deletion status' });
    }
  };
  
  handleRequest();
});

// Delete document - UPDATES JSON FILES
router.delete('/:id', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const { id } = req.params;
      const userId = req.headers['user-id'] as string;
      const { force } = req.query;

      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }

      // Find project that contains this document
      const cachedDoc = await Document.findOne({ googleDriveId: id });
      let project: any = null;
      let documents: any[] = [];

      if (cachedDoc) {
        project = await Project.findById(cachedDoc.project);
      } else {
        // Search through user's projects
        const userProjects = await Project.find({ owner: userId });
        for (const proj of userProjects) {
          const user = await User.findById(userId);
          if (user?.accessToken && user?.refreshToken) {
            try {
              const googleService = new GoogleService(user.accessToken, user.refreshToken, userId, user.email);
              const projDocuments = await googleService.getDocuments(proj.rootFolderId);
              if (projDocuments.some(doc => doc.id === id)) {
                project = proj;
                documents = projDocuments;
                break;
              }
            } catch (error) {
              console.warn(`Failed to check project ${proj._id} for document ${id}`);
            }
          }
        }
      }

      if (!project) {
        return res.status(404).json({ error: 'Document not found or access denied' });
      }

      if (project.owner.toString() !== userId) {
        return res.status(403).json({ error: 'Not authorized to delete this document' });
      }

      // Get documents and user if we don't have them yet
      const user = await User.findById(userId);
      if (!user?.accessToken || !user?.refreshToken) {
        return res.status(400).json({ error: 'Missing authentication tokens' });
      }

      const googleService = new GoogleService(user.accessToken, user.refreshToken, userId, user.email);
      
      if (documents.length === 0) {
        documents = await googleService.getDocuments(project.rootFolderId);
      }

      // Find the target document
      const targetDoc = documents.find(doc => doc.id === id);
      if (!targetDoc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // If it's a folder and force is not specified, check if it has children
      if (targetDoc.documentType === 'folder' && force !== 'true') {
        const children = documents.filter(doc => doc.parentId === id);
        if (children.length > 0) {
          return res.status(400).json({ 
            error: 'Cannot delete non-empty folder',
            code: 'FOLDER_NOT_EMPTY',
            childCount: children.length
          });
        }
      }

      // Get all documents to delete (including descendants if force deleting folder)
      let documentsToDelete = [targetDoc];
      if (targetDoc.documentType === 'folder' && force === 'true') {
        // Recursively get all descendants
        const getAllDescendants = (parentId: string): any[] => {
          const children = documents.filter(doc => doc.parentId === parentId);
          let descendants = [...children];
          
          for (const child of children) {
            if (child.documentType === 'folder') {
              const childDescendants = getAllDescendants(child.id);
              descendants = descendants.concat(childDescendants);
            }
          }
          
          return descendants;
        };
        
        const descendants = getAllDescendants(id);
        documentsToDelete = [targetDoc, ...descendants];
      }

      // Delete from Google Drive and update JSON index
      for (const doc of documentsToDelete) {
        try {
          await googleService.deleteDocument(project.rootFolderId, doc.id);
          console.log(`🗑️ Deleted document: ${doc.title} (${doc.id})`);
        } catch (googleError) {
          console.error(`Failed to delete document ${doc.id}:`, googleError);
          // Continue with other deletions
        }
      }

      // Delete cached versions from MongoDB
      const deletedCacheCount = await Document.deleteMany({ 
        googleDriveId: { $in: documentsToDelete.map(doc => doc.id) }
      });

      console.log(`🗑️ Deleted ${deletedCacheCount.deletedCount} cached documents from MongoDB`);

      return res.json({ 
        success: true, 
        message: `Successfully deleted ${documentsToDelete.length} document(s)`,
        deletedCount: documentsToDelete.length
      });
    } catch (error) {
      console.error('Delete document error:', error);
      return res.status(500).json({ error: 'Failed to delete document' });
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

      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }

      // Find project that contains this document
      const cachedDoc = await Document.findOne({ googleDriveId: id });
      let project: any = null;

      if (cachedDoc) {
        project = await Project.findById(cachedDoc.project);
      } else {
        // Search through user's projects
        const userProjects = await Project.find({ owner: userId });
        for (const proj of userProjects) {
          const user = await User.findById(userId);
          if (user?.accessToken && user?.refreshToken) {
            try {
              const googleService = new GoogleService(user.accessToken, user.refreshToken, userId, user.email);
              const projDocuments = await googleService.getDocuments(proj.rootFolderId);
              if (projDocuments.some(doc => doc.id === id)) {
                project = proj;
                break;
              }
            } catch (error) {
              console.warn(`Failed to check project ${proj._id} for document ${id}`);
            }
          }
        }
      }

      if (!project) {
        return res.status(404).json({ error: 'Document not found or access denied' });
      }

      if (project.owner.toString() !== userId) {
        return res.status(403).json({ error: 'Not authorized to access this document' });
      }

      const user = await User.findById(userId);
      if (!user?.accessToken || !user?.refreshToken) {
        return res.status(400).json({ error: 'Missing authentication tokens' });
      }

      const googleService = new GoogleService(user.accessToken, user.refreshToken, userId, user.email);
      const content = await googleService.getDocumentContent(id);

      console.log(`📖 Retrieved content for document: ${id}`);
      return res.json(content);
    } catch (error) {
      console.error('Get document content error:', error);
      return res.status(500).json({ error: 'Failed to get document content' });
    }
  };
  
  handleRequest();
});

export default router;