import express from 'express';
import type { Request, Response } from 'express';
import Project from '../models/Project.js';
import Document from '../models/Document.js';
import User from '../models/User.js';
import GoogleService from '../services/GoogleService.js';

const router = express.Router();

// Get all projects for a user
router.get('/', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const userId = req.headers['user-id'] as string;
      
      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }
      
      // Get basic project info from MongoDB
      const projects = await Project.find({ owner: userId });
      
      // Enrich with metadata from Google Drive JSON files
      const user = await User.findById(userId);
      if (user?.accessToken && user?.refreshToken) {
        try {
          const googleService = new GoogleService(user.accessToken, user.refreshToken, userId, user.email);
          
          const enrichedProjects = await Promise.all(
            projects.map(async (project) => {
              try {
                const metadata = await googleService.getProject(project.rootFolderId);
                return {
                  _id: project._id,
                  name: project.name,
                  description: metadata.description,
                  rootFolderId: project.rootFolderId,
                  createdAt: project.createdAt,
                  updatedAt: project.updatedAt,
                  metadata: {
                    version: metadata.version,
                    statistics: metadata.statistics,
                    settings: metadata.settings,
                    collaborators: metadata.collaborators,
                  }
                };
              } catch (error) {
                console.warn(`Failed to load metadata for project ${project._id}:`, error);
                return {
                  _id: project._id,
                  name: project.name,
                  rootFolderId: project.rootFolderId,
                  createdAt: project.createdAt,
                  updatedAt: project.updatedAt,
                  error: 'Failed to load project metadata'
                };
              }
            })
          );
          
          return res.json(enrichedProjects);
        } catch (error) {
          console.warn('Failed to enrich projects with metadata:', error);
        }
      }
      
      // Fallback to basic project info
      res.json(projects);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      res.status(500).json({ error: 'Failed to fetch projects' });
    }
  };
  
  handleRequest();
});

// Create new project
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
      
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      if (!user.accessToken || !user.refreshToken) {
        return res.status(400).json({ error: 'Missing authentication tokens' });
      }
      
      const googleService = new GoogleService(user.accessToken, user.refreshToken, userId, user.email);
      const { folderId, metadata } = await googleService.createProject(name.trim(), description?.trim() || '');
      
      // Store minimal info in MongoDB
      const project = await Project.create({
        name: name.trim(),
        owner: userId,
        rootFolderId: folderId,
      });
      
      console.log(`✅ Created project "${name}" with JSON metadata`);
      
      res.status(201).json({
        _id: project._id,
        name: project.name,
        description: metadata.description,
        rootFolderId: project.rootFolderId,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        metadata: {
          version: metadata.version,
          statistics: metadata.statistics,
          settings: metadata.settings,
          structure: metadata.structure,
        }
      });
    } catch (error) {
      console.error('Project creation error:', error);
      res.status(500).json({ error: 'Failed to create project' });
    }
  };
  
  handleRequest();
});

// Get a specific project
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
        return res.status(403).json({ error: 'Not authorized to access this project' });
      }
      
      const user = await User.findById(userId);
      if (!user?.accessToken || !user?.refreshToken) {
        return res.status(400).json({ error: 'Missing authentication tokens' });
      }
      
      try {
        const googleService = new GoogleService(user.accessToken, user.refreshToken, userId, user.email);
        const metadata = await googleService.getProject(project.rootFolderId);
        
        res.json({
          _id: project._id,
          name: project.name,
          description: metadata.description,
          rootFolderId: project.rootFolderId,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          metadata: metadata
        });
      } catch (error) {
        console.error('Failed to load project metadata:', error);
        
        res.json({
          _id: project._id,
          name: project.name,
          rootFolderId: project.rootFolderId,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          error: 'Failed to load project metadata from Google Drive'
        });
      }
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
      const { name, description, settings, collaborators } = req.body;
      
      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }
      
      const project = await Project.findById(id);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      if (project.owner.toString() !== userId) {
        return res.status(403).json({ error: 'Not authorized to modify this project' });
      }
      
      const user = await User.findById(userId);
      if (!user?.accessToken || !user?.refreshToken) {
        return res.status(400).json({ error: 'Missing authentication tokens' });
      }

      const googleService = new GoogleService(user.accessToken, user.refreshToken, userId, user.email);
      
      // Update JSON metadata in Google Drive
      const updates: any = {};
      if (name !== undefined) updates.name = name.trim();
      if (description !== undefined) updates.description = description.trim();
      if (settings !== undefined) updates.settings = settings;
      if (collaborators !== undefined) updates.collaborators = collaborators;
      
      const updatedMetadata = await googleService.updateProject(project.rootFolderId, updates);
      
      // Update name in MongoDB if changed
      if (name !== undefined && name.trim() !== project.name) {
        project.name = name.trim();
        await project.save();
      }
      
      console.log(`✅ Updated project "${project.name}" metadata`);
      
      res.json({
        _id: project._id,
        name: project.name,
        description: updatedMetadata.description,
        rootFolderId: project.rootFolderId,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        metadata: updatedMetadata
      });
    } catch (error) {
      console.error('Project update error:', error);
      res.status(500).json({ error: 'Failed to update project' });
    }
  };
  
  handleRequest();
});

// Sync project - now just validates JSON files exist
router.post('/:id/sync', function(req: Request, res: Response) {
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
        return res.status(403).json({ error: 'Not authorized to sync this project' });
      }

      const user = await User.findById(userId);
      if (!user?.accessToken || !user?.refreshToken) {
        return res.status(400).json({ error: 'Missing authentication tokens' });
      }

      const googleService = new GoogleService(user.accessToken, user.refreshToken, userId, user.email);
      
      const [metadata, documents] = await Promise.all([
        googleService.getProject(project.rootFolderId),
        googleService.getDocuments(project.rootFolderId)
      ]);

      console.log(`✅ Synced project "${project.name}" - ${documents.length} documents`);

      res.json({ 
        success: true, 
        message: 'Project synced successfully',
        documentCount: documents.length,
        metadata: {
          version: metadata.version,
          statistics: metadata.statistics
        }
      });
    } catch (error) {
      console.error('Sync error:', error);
      res.status(500).json({ 
        error: 'Sync failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      });
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

      const project = await Project.findById(id);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      if (project.owner.toString() !== userId) {
        return res.status(403).json({ error: 'Not authorized to delete this project' });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (user.accessToken && user.refreshToken && project.rootFolderId) {
        try {
          const googleService = new GoogleService(user.accessToken, user.refreshToken, userId, user.email);
          await googleService.deleteFile(project.rootFolderId);
          console.log(`🗑️ Deleted Google Drive folder: ${project.rootFolderId}`);
        } catch (googleError) {
          console.error('❌ Failed to delete from Google Drive:', googleError);
        }
      }

      // Clean up any cached documents
      const deletedDocs = await Document.deleteMany({ project: id });
      console.log(`🗑️ Deleted ${deletedDocs.deletedCount} cached documents from MongoDB`);

      await Project.findByIdAndDelete(id);
      console.log(`🗑️ Deleted project: ${project.name}`);

      return res.json({ 
        success: true, 
        message: 'Project and all associated data deleted successfully',
        deletedDocuments: deletedDocs.deletedCount
      });
    } catch (error) {
      console.error('Delete project error:', error);
      return res.status(500).json({ error: 'Failed to delete project' });
    }
  };
  
  handleRequest();
});

// Get project statistics
router.get('/:id/stats', function(req: Request, res: Response) {
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
        return res.status(403).json({ error: 'Not authorized to access this project' });
      }
      
      const user = await User.findById(userId);
      if (!user?.accessToken || !user?.refreshToken) {
        return res.status(400).json({ error: 'Missing authentication tokens' });
      }

      const googleService = new GoogleService(user.accessToken, user.refreshToken, userId, user.email);
      
      const [metadata, documents] = await Promise.all([
        googleService.getProject(project.rootFolderId),
        googleService.getDocuments(project.rootFolderId)
      ]);
      
      const stats = {
        totalDocuments: documents.length,
        documentsByType: documents.reduce((acc: Record<string, number>, doc) => {
          acc[doc.documentType] = (acc[doc.documentType] || 0) + 1;
          return acc;
        }, {}),
        totalWords: documents.reduce((sum, doc) => sum + (doc.wordCount || 0), 0),
        averageWordsPerDocument: documents.length > 0 ? 
          Math.round(documents.reduce((sum, doc) => sum + (doc.wordCount || 0), 0) / documents.length) : 0,
        compilableDocuments: documents.filter(doc => doc.includeInCompile).length,
        lastUpdated: metadata.statistics?.lastUpdated || new Date().toISOString(),
      };
      
      res.json(stats);
    } catch (error) {
      console.error('Failed to get project statistics:', error);
      res.status(500).json({ error: 'Failed to get project statistics' });
    }
  };
  
  handleRequest();
});

export default router;