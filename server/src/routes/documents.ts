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

// Create new document - SAVES TO JSON FILES
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

      // Determine parent folder ID
      let parentFolderId = project.rootFolderId;
      if (parentId && parentId !== 'root') {
        const documents = await googleService.getDocuments(project.rootFolderId);
        const parentDoc = documents.find(doc => doc.id === parentId);
        if (parentDoc && parentDoc.documentType === 'folder') {
          parentFolderId = parentDoc.id;
        }
      }

      const { driveId, metadata } = await googleService.createDocument(
        project.rootFolderId,
        title,
        parentFolderId,
        documentType
      );

      // Optionally cache in MongoDB for search/performance
      try {
        await Document.create({
          project: projectId,
          googleDriveId: driveId,
          title,
          documentType,
          parentGoogleId: parentId === 'root' ? undefined : parentId,
          order: metadata.order,
          lastSyncedAt: new Date(),
        });
        console.log(`💾 Cached document in MongoDB: ${title}`);
      } catch (cacheError) {
        console.warn('Failed to cache document in MongoDB (non-critical):', cacheError);
      }

      console.log(`✅ Created ${documentType} "${title}" with JSON metadata`);
      return res.status(201).json(metadata);
    } catch (error) {
      console.error('Document creation error:', error);
      return res.status(500).json({ error: 'Failed to create document' });
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

export default router;