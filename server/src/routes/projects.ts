import express from 'express';
import type { Request, Response } from 'express';
import Project from '../models/Project.js';
import Document from '../models/Document.js';
import User from '../models/User.js';
import GoogleService from '../services/GoogleService.js';

const router = express.Router();

// Helper function to safely create GoogleService
function createGoogleService(user: any, userId: string): GoogleService {
  if (!user.accessToken || !user.refreshToken) {
    throw new Error('Missing authentication tokens');
  }
  
  const accessToken: string = user.accessToken;
  const refreshToken: string = user.refreshToken;
  const userEmail: string = user.email || '';
  
  return new GoogleService(accessToken, refreshToken, userId, userEmail);
}

// Get all projects for a user
router.get('/', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const userId = req.headers['user-id'] as string;
      
      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }
      
      // Get projects from MongoDB (minimal data)
      const projects = await Project.find({ owner: userId }).select('name rootFolderId createdAt updatedAt syncStatus lastSyncTime');
      
      // Optionally enrich with metadata from Google Drive JSON files
      const user = await User.findById(userId);
      if (user?.accessToken && user?.refreshToken) {
        try {
          const googleService = createGoogleService(user, userId);
          
          // Enrich each project with Google Drive metadata
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
                  syncStatus: project.syncStatus,
                  lastSyncTime: project.lastSyncTime,
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
                  syncStatus: 'error',
                  syncError: 'Failed to load project metadata'
                };
              }
            })
          );
          
          return res.json(enrichedProjects);
        } catch (error) {
          console.warn('Failed to enrich projects with metadata:', error);
        }
      }
      
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

      const googleService = createGoogleService(user, userId);
      const { folderId, metadata } = await googleService.createProject(name.trim(), description?.trim() || '');
      
      const project = await Project.create({
        name: name.trim(),
        owner: userId,
        rootFolderId: folderId,
        syncStatus: 'synced',
        lastSyncTime: new Date(),
      });
      
      console.log(`✅ Created project "${name}" with JSON metadata`);
      
      res.status(201).json({
        _id: project._id,
        name: project.name,
        description: metadata.description,
        rootFolderId: project.rootFolderId,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        syncStatus: project.syncStatus,
        lastSyncTime: project.lastSyncTime,
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
        const googleService = createGoogleService(user, userId);
        const metadata = await googleService.getProject(project.rootFolderId);
        
        res.json({
          _id: project._id,
          name: project.name,
          description: metadata.description,
          rootFolderId: project.rootFolderId,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          syncStatus: project.syncStatus,
          lastSyncTime: project.lastSyncTime,
          metadata: metadata
        });
      } catch (error) {
        console.error('Failed to load project metadata:', error);
        
        project.syncStatus = 'error';
        project.syncError = 'Failed to load project metadata from Google Drive';
        await project.save();
        
        res.json({
          _id: project._id,
          name: project.name,
          rootFolderId: project.rootFolderId,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          syncStatus: 'error',
          syncError: 'Failed to load project metadata from Google Drive'
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

      const googleService = createGoogleService(user, userId);
      
      const updates: any = {};
      if (name !== undefined) updates.name = name.trim();
      if (description !== undefined) updates.description = description.trim();
      if (settings !== undefined) updates.settings = settings;
      if (collaborators !== undefined) updates.collaborators = collaborators;
      
      const updatedMetadata = await googleService.updateProject(project.rootFolderId, updates);
      
      if (name !== undefined && name.trim() !== project.name) {
        project.name = name.trim();
        project.lastSyncTime = new Date();
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
        syncStatus: 'synced',
        lastSyncTime: new Date(),
        metadata: updatedMetadata
      });
    } catch (error) {
      console.error('Project update error:', error);
      res.status(500).json({ error: 'Failed to update project' });
    }
  };
  
  handleRequest();
});

// Sync project
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

      project.syncStatus = 'syncing';
      await project.save();

      try {
        const googleService = createGoogleService(user, userId);
        
        const [metadata, documents] = await Promise.all([
          googleService.getProject(project.rootFolderId),
          googleService.getDocuments(project.rootFolderId)
        ]);
        
        project.syncStatus = 'synced';
        project.lastSyncTime = new Date();
        project.syncError = undefined;
        await project.save();

        console.log(`✅ Synced project "${project.name}" - ${documents.length} documents`);

        res.json({ 
          success: true, 
          message: 'Project synced successfully',
          lastSyncTime: project.lastSyncTime,
          documentCount: documents.length,
          metadata: {
            version: metadata.version,
            statistics: metadata.statistics
          }
        });
      } catch (syncError) {
        project.syncStatus = 'error';
        project.syncError = syncError instanceof Error ? syncError.message : 'Unknown sync error';
        await project.save();

        console.error('Sync error:', syncError);
        res.status(500).json({ 
          error: 'Sync failed', 
          details: syncError instanceof Error ? syncError.message : 'Unknown error' 
        });
      }
    } catch (error) {
      console.error('Sync endpoint error:', error);
      res.status(500).json({ error: 'Failed to initiate sync' });
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
          const googleService = createGoogleService(user, userId);
          await googleService.deleteFile(project.rootFolderId);
          console.log(`🗑️ Deleted Google Drive folder: ${project.rootFolderId}`);
        } catch (googleError) {
          console.error('❌ Failed to delete from Google Drive:', googleError);
        }
      }

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

      const googleService = createGoogleService(user, userId);
      
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
        syncStatus: project.syncStatus,
        lastSyncTime: project.lastSyncTime
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
