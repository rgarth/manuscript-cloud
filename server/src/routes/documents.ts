import express from 'express';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';

// Import models with explicit typing to avoid Router conflicts
const Document = mongoose.model('Document');
const Project = mongoose.model('Project');
const User = mongoose.model('User');

import GoogleService from '../services/GoogleService.js';

const router = express.Router();

// Get all documents for a project - READS FROM MONGODB NOW
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

      // Get documents from MongoDB (primary storage now)
      const documents = await Document.find({ project: projectId })
        .sort({ order: 1, createdAt: 1 });

      const formattedDocs = documents.map(doc => ({
        id: doc.googleDriveId || doc._id.toString(),
        title: doc.title,
        documentType: doc.documentType,
        content: doc.content || '',
        parentId: doc.parentGoogleId,
        order: doc.order,
        synopsis: doc.synopsis,
        status: doc.metadata.status,
        tags: doc.metadata.tags,
        wordCount: doc.metadata.wordCount || 0,
        includeInCompile: doc.metadata.includeInCompile,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
        lastEditedAt: doc.lastEditedAt ? doc.lastEditedAt.toISOString() : doc.updatedAt.toISOString(),
        customFields: doc.metadata.customFields
      }));

      console.log(`📄 Retrieved ${formattedDocs.length} documents from MongoDB`);
      return res.json(formattedDocs);
    } catch (error) {
      console.error('Error fetching documents:', error);
      return res.status(500).json({ error: 'Failed to fetch documents' });
    }
  };
  
  handleRequest();
});

// Create new document - SAVES TO MONGODB + GOOGLE DRIVE
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

      // Create in Google Drive first to get ID
      let actualParentFolderId = project.rootFolderId;
      let documentParentId: string | undefined = undefined;

      if (parentId && parentId !== 'root') {
        const parentDoc = await Document.findOne({
          $or: [
            { googleDriveId: parentId },
            { _id: parentId }
          ]
        });
        
        if (parentDoc && ['folder', 'chapter', 'part'].includes(parentDoc.documentType)) {
          actualParentFolderId = parentDoc.googleDriveId || parentId;
          documentParentId = parentId;
        }
      }

      const { driveId } = await googleService.createDocument(
        project.rootFolderId,
        title,
        actualParentFolderId,
        documentType
      );

      // Create in MongoDB (primary storage)
      const newDocument = await Document.create({
        project: projectId,
        title,
        documentType,
        googleDriveId: driveId,
        parentGoogleId: documentParentId,
        order: Date.now(),
        content: '',
        lastEditedAt: new Date(),
        synopsis: synopsis || '',
        metadata: {
          status: 'draft',
          tags: [],
          wordCount: 0,
          characterCount: 0,
          includeInCompile: documentType === 'scene',
          customFields: {}
        }
      });

      console.log(`✅ Created ${documentType} "${title}" in MongoDB and Google Drive`);
      
      return res.status(201).json({
        id: driveId,
        title: newDocument.title,
        documentType: newDocument.documentType,
        content: newDocument.content,
        parentId: documentParentId,
        order: newDocument.order,
        synopsis: newDocument.synopsis,
        status: newDocument.metadata.status,
        tags: newDocument.metadata.tags,
        wordCount: newDocument.metadata.wordCount,
        includeInCompile: newDocument.metadata.includeInCompile,
        createdAt: newDocument.createdAt.toISOString(),
        updatedAt: newDocument.updatedAt.toISOString(),
        lastEditedAt: newDocument.lastEditedAt.toISOString(),
        customFields: newDocument.metadata.customFields
      });
    } catch (error) {
      console.error('Document creation error:', error);
      return res.status(500).json({ error: 'Failed to create document' });
    }
  };
  
  handleRequest();
});

// Update document metadata and content - MONGODB PRIMARY
router.patch('/:id', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const { id } = req.params;
      const userId = req.headers['user-id'] as string;
      const { title, synopsis, metadata: metadataUpdates } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }

      // Find document in MongoDB first (now stores content locally)
      let document = await Document.findOne({ 
        $or: [
          { googleDriveId: id },
          { _id: id }
        ]
      });

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // Verify user owns this document's project
      const project = await Project.findById(document.project);
      if (!project || project.owner.toString() !== userId) {
        return res.status(403).json({ error: 'Not authorized to update this document' });
      }

      // Update document in MongoDB
      const updates: any = {};
      if (title !== undefined) updates.title = title;
      if (synopsis !== undefined) updates.synopsis = synopsis;
      
      if (metadataUpdates !== undefined) {
        // Handle content update
        if (metadataUpdates.content !== undefined) {
          updates.content = metadataUpdates.content;
          updates.lastEditedAt = new Date();
        }
        
        // Handle other metadata
        if (metadataUpdates.status !== undefined) updates['metadata.status'] = metadataUpdates.status;
        if (metadataUpdates.tags !== undefined) updates['metadata.tags'] = metadataUpdates.tags;
        if (metadataUpdates.includeInCompile !== undefined) updates['metadata.includeInCompile'] = metadataUpdates.includeInCompile;
        if (metadataUpdates.customFields !== undefined) updates['metadata.customFields'] = metadataUpdates.customFields;
        if (metadataUpdates.wordCount !== undefined) updates['metadata.wordCount'] = metadataUpdates.wordCount;
        if (metadataUpdates.writingGoals !== undefined) updates['metadata.writingGoals'] = metadataUpdates.writingGoals;
      }

      const updatedDocument = await Document.findByIdAndUpdate(
        document._id,
        updates,
        { new: true, runValidators: true }
      );

      if (!updatedDocument) {
        return res.status(404).json({ error: 'Document not found after update' });
      }

      // Optionally sync to Google Drive in background (non-blocking)
      const user = await User.findById(userId);
      if (user?.accessToken && user?.refreshToken && project.rootFolderId) {
        try {
          const googleService = new GoogleService(user.accessToken, user.refreshToken, userId, user.email);
          // Background sync - don't wait for it
          googleService.updateDocument(project.rootFolderId, updatedDocument.googleDriveId || id, {
            title: updatedDocument.title,
            synopsis: updatedDocument.synopsis,
            status: updatedDocument.metadata.status,
            tags: updatedDocument.metadata.tags,
            includeInCompile: updatedDocument.metadata.includeInCompile,
            wordCount: updatedDocument.metadata.wordCount
          }).catch(error => {
            console.warn('Background Google Drive sync failed:', error);
          });
        } catch (error) {
          console.warn('Failed to setup background sync:', error);
        }
      }

      console.log(`📝 Updated document: ${updatedDocument.title} (${updatedDocument._id})`);
      return res.json({
        id: updatedDocument.googleDriveId || updatedDocument._id.toString(),
        title: updatedDocument.title,
        documentType: updatedDocument.documentType,
        content: updatedDocument.content,
        synopsis: updatedDocument.synopsis,
        parentId: updatedDocument.parentGoogleId,
        order: updatedDocument.order,
        status: updatedDocument.metadata.status,
        tags: updatedDocument.metadata.tags,
        wordCount: updatedDocument.metadata.wordCount,
        includeInCompile: updatedDocument.metadata.includeInCompile,
        createdAt: updatedDocument.createdAt.toISOString(),
        updatedAt: updatedDocument.updatedAt.toISOString(),
        lastEditedAt: updatedDocument.lastEditedAt.toISOString(),
        customFields: updatedDocument.metadata.customFields
      });
    } catch (error) {
      console.error('Update document error:', error);
      return res.status(500).json({ error: 'Failed to update document' });
    }
  };
  
  handleRequest();
});

// Move document to new parent - MONGODB + GOOGLE DRIVE
router.patch('/:id/move', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const { id } = req.params;
      const userId = req.headers['user-id'] as string;
      const { newParentId } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }

      // Find document in MongoDB
      const document = await Document.findOne({
        $or: [
          { googleDriveId: id },
          { _id: id }
        ]
      });

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // Verify ownership
      const project = await Project.findById(document.project);
      if (!project || project.owner.toString() !== userId) {
        return res.status(403).json({ error: 'Not authorized to move this document' });
      }

      // Update parent in MongoDB
      document.parentGoogleId = newParentId;
      await document.save();

      // Also move in Google Drive if possible
      const user = await User.findById(userId);
      if (user?.accessToken && user?.refreshToken) {
        try {
          const googleService = new GoogleService(user.accessToken, user.refreshToken, userId, user.email);
          await googleService.updateDocument(project.rootFolderId, id, {
            parentId: newParentId
          });
        } catch (error) {
          console.warn('Failed to move in Google Drive (non-critical):', error);
        }
      }

      console.log(`✅ Moved document "${document.title}" to new parent`);
      return res.json({
        id: document.googleDriveId || document._id.toString(),
        title: document.title,
        documentType: document.documentType,
        parentId: document.parentGoogleId,
        order: document.order
      });
    } catch (error) {
      console.error('Move document error:', error);
      return res.status(500).json({ error: 'Failed to move document' });
    }
  };
  
  handleRequest();
});

// Check if document can be deleted - MONGODB
router.get('/:id/can-delete', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const { id } = req.params;
      const userId = req.headers['user-id'] as string;

      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }

      const document = await Document.findOne({
        $or: [
          { googleDriveId: id },
          { _id: id }
        ]
      });

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const project = await Project.findById(document.project);
      if (!project || project.owner.toString() !== userId) {
        return res.status(403).json({ error: 'Not authorized to access this document' });
      }

      // Check for children in MongoDB
      const children = await Document.find({ 
        parentGoogleId: document.googleDriveId || document._id.toString() 
      });

      const canDelete = children.length === 0 || document.documentType !== 'folder';

      return res.json({
        canDelete,
        childCount: children.length,
        children: children.map(child => ({
          id: child.googleDriveId || child._id.toString(),
          title: child.title,
          type: child.documentType
        })),
        document: {
          id: document.googleDriveId || document._id.toString(),
          title: document.title,
          type: document.documentType
        }
      });
    } catch (error) {
      console.error('Can delete check error:', error);
      return res.status(500).json({ error: 'Failed to check deletion status' });
    }
  };
  
  handleRequest();
});

// Delete document - MONGODB + GOOGLE DRIVE
router.delete('/:id', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const { id } = req.params;
      const userId = req.headers['user-id'] as string;
      const { force } = req.query;

      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }

      const document = await Document.findOne({
        $or: [
          { googleDriveId: id },
          { _id: id }
        ]
      });

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const project = await Project.findById(document.project);
      if (!project || project.owner.toString() !== userId) {
        return res.status(403).json({ error: 'Not authorized to delete this document' });
      }

      // Check for children
      if (document.documentType === 'folder' && force !== 'true') {
        const children = await Document.find({ 
          parentGoogleId: document.googleDriveId || document._id.toString() 
        });
        
        if (children.length > 0) {
          return res.status(400).json({ 
            error: 'Cannot delete non-empty folder',
            code: 'FOLDER_NOT_EMPTY',
            childCount: children.length
          });
        }
      }

      // Delete from MongoDB (and descendants if force)
      let deletedCount = 0;
      if (document.documentType === 'folder' && force === 'true') {
        // Recursively delete all descendants
        const deleteRecursive = async (parentId: string) => {
          const children = await Document.find({ parentGoogleId: parentId });
          for (const child of children) {
            if (child.documentType === 'folder') {
              await deleteRecursive(child.googleDriveId || child._id.toString());
            }
            await Document.findByIdAndDelete(child._id);
            deletedCount++;
          }
        };
        
        await deleteRecursive(document.googleDriveId || document._id.toString());
      }

      await Document.findByIdAndDelete(document._id);
      deletedCount++;

      // Delete from Google Drive
      const user = await User.findById(userId);
      if (user?.accessToken && user?.refreshToken) {
        try {
          const googleService = new GoogleService(user.accessToken, user.refreshToken, userId, user.email);
          await googleService.deleteDocument(project.rootFolderId, document.googleDriveId || id);
        } catch (error) {
          console.warn('Failed to delete from Google Drive (non-critical):', error);
        }
      }

      console.log(`🗑️ Deleted ${deletedCount} document(s) from MongoDB`);
      return res.json({ 
        success: true, 
        message: `Successfully deleted ${deletedCount} document(s)`,
        deletedCount
      });
    } catch (error) {
      console.error('Delete document error:', error);
      return res.status(500).json({ error: 'Failed to delete document' });
    }
  };
  
  handleRequest();
});

// Get document content - MONGODB PRIMARY
router.get('/:id/content', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const { id } = req.params;
      const userId = req.headers['user-id'] as string;

      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }

      // Find document in MongoDB first
      let document = await Document.findOne({ 
        $or: [
          { googleDriveId: id },
          { _id: id }
        ]
      }).populate('project');

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // Verify user owns this document's project
      const project = document.project as any;
      if (!project || project.owner.toString() !== userId) {
        return res.status(403).json({ error: 'Not authorized to access this document' });
      }

      console.log(`📖 Retrieved content for document: ${document.title}`);
      return res.json({
        id: document.googleDriveId || document._id.toString(),
        title: document.title,
        documentType: document.documentType,
        content: document.content || '',
        wordCount: document.metadata.wordCount || 0,
        characterCount: document.metadata.characterCount || 0,
        lastEditedAt: document.lastEditedAt.toISOString(),
        status: document.metadata.status,
        tags: document.metadata.tags,
        includeInCompile: document.metadata.includeInCompile,
        writingGoals: document.metadata.writingGoals,
        readingTimeMinutes: document.getReadingTimeMinutes(),
        progress: document.getWritingProgress()
      });
    } catch (error) {
      console.error('Get document content error:', error);
      return res.status(500).json({ error: 'Failed to get document content' });
    }
  };
  
  handleRequest();
});

export default router;