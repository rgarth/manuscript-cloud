import express from 'express';
import type { Request, Response } from 'express';
import Project from '../models/Project.js';
import Document from '../models/Document.js';
import User from '../models/User.js';

const router = express.Router();

// Get all projects
router.get('/', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const userId = req.headers['user-id'] as string;
      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }
      
      const projects = await Project.find({ owner: userId });
      res.json(projects);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      res.status(500).json({ error: 'Failed to fetch projects' });
    }
  };
  
  handleRequest();
});

// Create project
router.post('/', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const { name, description } = req.body;
      const userId = req.headers['user-id'] as string;
      
      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }
      
      if (!name?.trim()) {
        return res.status(400).json({ error: 'Project name is required' });
      }
      
      const project = await Project.create({
        name: name.trim(),
        description: description?.trim() || '',
        owner: userId,
      });
      
      // Create default structure
      const defaultDocs = [
        { title: 'Chapters', documentType: 'folder', order: 0 },
        { title: 'Characters', documentType: 'folder', order: 1 },
        { title: 'Settings', documentType: 'folder', order: 2 },
        { title: 'Research', documentType: 'folder', order: 3 },
        { title: 'Notes', documentType: 'folder', order: 4 },
      ];
      
      for (const doc of defaultDocs) {
        await Document.create({
          ...doc,
          project: project._id,
        });
      }
      
      console.log(`✅ Created project "${name}" with default structure`);
      res.status(201).json(project);
    } catch (error) {
      console.error('Project creation error:', error);
      res.status(500).json({ error: 'Failed to create project' });
    }
  };
  
  handleRequest();
});

// Get project by ID
router.get('/:id', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const { id } = req.params;
      const userId = req.headers['user-id'] as string;
      
      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }
      
      const project = await Project.findById(id);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      if (project.owner.toString() !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }
      
      res.json(project);
    } catch (error) {
      console.error('Error fetching project:', error);
      res.status(500).json({ error: 'Failed to fetch project' });
    }
  };
  
  handleRequest();
});

// Update project
router.patch('/:id', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const { id } = req.params;
      const userId = req.headers['user-id'] as string;
      const updates = req.body;
      
      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }
      
      const project = await Project.findOneAndUpdate(
        { _id: id, owner: userId },
        updates,
        { new: true }
      );
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      res.json(project);
    } catch (error) {
      console.error('Project update error:', error);
      res.status(500).json({ error: 'Failed to update project' });
    }
  };
  
  handleRequest();
});

// Delete project
router.delete('/:id', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const { id } = req.params;
      const userId = req.headers['user-id'] as string;
      
      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }
      
      const project = await Project.findOne({ _id: id, owner: userId });
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Delete all documents
      const deletedDocs = await Document.deleteMany({ project: id });
      await Project.findByIdAndDelete(id);
      
      console.log(`🗑️ Deleted project "${project.name}" and ${deletedDocs.deletedCount} documents`);
      res.json({ success: true, deletedDocuments: deletedDocs.deletedCount });
    } catch (error) {
      console.error('Delete project error:', error);
      res.status(500).json({ error: 'Failed to delete project' });
    }
  };
  
  handleRequest();
});

// Export project as JSON
router.get('/:id/export', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const { id } = req.params;
      const userId = req.headers['user-id'] as string;
      
      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }
      
      const project = await Project.findOne({ _id: id, owner: userId });
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      const documents = await Document.find({ project: id }).sort({ order: 1 });
      
      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        project: {
          name: project.name,
          description: project.description,
          settings: project.settings,
          createdAt: project.createdAt,
        },
        documents: documents.map(doc => ({
          id: doc._id,
          title: doc.title,
          content: doc.content,
          documentType: doc.documentType,
          parentId: doc.parent,
          order: doc.order,
          synopsis: doc.synopsis,
          metadata: doc.metadata,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        })),
      };
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${project.name}.manuscript"`);
      res.json(exportData);
    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({ error: 'Failed to export project' });
    }
  };
  
  handleRequest();
});

export default router;