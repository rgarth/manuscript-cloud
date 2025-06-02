import express from 'express';
import type { Request, Response } from 'express';
import Document from '../models/Document.js';
import Project from '../models/Project.js';

const router = express.Router();

// Get documents by project
router.get('/project/:projectId', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const { projectId } = req.params;
      const userId = req.headers['user-id'] as string;
      
      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }
      
      // Verify project ownership
      const project = await Project.findOne({ _id: projectId, owner: userId });
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      const documents = await Document.find({ project: projectId }).sort({ order: 1 });
      res.json(documents);
    } catch (error) {
      console.error('Error fetching documents:', error);
      res.status(500).json({ error: 'Failed to fetch documents' });
    }
  };
  
  handleRequest();
});

// Create document
router.post('/', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const { title, documentType, parentId, projectId, content } = req.body;
      const userId = req.headers['user-id'] as string;
      
      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }
      
      // Verify project ownership
      const project = await Project.findOne({ _id: projectId, owner: userId });
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      const document = await Document.create({
        title,
        documentType,
        parent: parentId || null,
        project: projectId,
        content: content || '',
        order: Date.now(), // Simple ordering
      });
      
      console.log(`📝 Created ${documentType} "${title}"`);
      res.status(201).json(document);
    } catch (error) {
      console.error('Document creation error:', error);
      res.status(500).json({ error: 'Failed to create document' });
    }
  };
  
  handleRequest();
});

// Update document
router.patch('/:id', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const { id } = req.params;
      const userId = req.headers['user-id'] as string;
      const updates = req.body;
      
      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }
      
      // Find document and verify ownership
      const document = await Document.findById(id).populate('project');
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }
      
      if ((document.project as any).owner.toString() !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }
      
      Object.assign(document, updates);
      await document.save();
      
      res.json(document);
    } catch (error) {
      console.error('Update document error:', error);
      res.status(500).json({ error: 'Failed to update document' });
    }
  };
  
  handleRequest();
});

// Move document
router.patch('/:id/move', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const { id } = req.params;
      const { newParentId } = req.body;
      const userId = req.headers['user-id'] as string;
      
      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }
      
      const document = await Document.findById(id).populate('project');
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }
      
      if ((document.project as any).owner.toString() !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }
      
      document.parent = newParentId || null;
      await document.save();
      
      console.log(`📁 Moved document "${document.title}"`);
      res.json(document);
    } catch (error) {
      console.error('Move document error:', error);
      res.status(500).json({ error: 'Failed to move document' });
    }
  };
  
  handleRequest();
});

// Delete document
router.delete('/:id', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const { id } = req.params;
      const { force } = req.query;
      const userId = req.headers['user-id'] as string;
      
      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }
      
      const document = await Document.findById(id).populate('project');
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }
      
      if ((document.project as any).owner.toString() !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }
      
      // Check for children if it's a folder
      if (['folder', 'chapter', 'part'].includes(document.documentType)) {
        const children = await Document.find({ parent: id });
        if (children.length > 0 && force !== 'true') {
          return res.status(400).json({ 
            error: 'Cannot delete non-empty folder',
            childCount: children.length 
          });
        }
        
        // Force delete children if requested
        if (force === 'true') {
          await Document.deleteMany({ parent: id });
        }
      }
      
      await Document.findByIdAndDelete(id);
      
      console.log(`🗑️ Deleted document "${document.title}"`);
      res.json({ success: true });
    } catch (error) {
      console.error('Delete document error:', error);
      res.status(500).json({ error: 'Failed to delete document' });
    }
  };
  
  handleRequest();
});

export default router;