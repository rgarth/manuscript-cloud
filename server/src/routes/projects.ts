// server/src/routes/projects.ts
import express from 'express';
import type { Request, Response } from 'express';
import Project from '../models/Project.js';
import Document from '../models/Document.js';
import User from '../models/User.js';
import GoogleService from '../services/GoogleService.js';
import { syncProject } from '../services/SyncService.js';

const router = express.Router();

// Get all projects for a user
router.get('/', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const userId = req.headers['user-id']; // In production use proper auth middleware
      const projects = await Project.find({ owner: userId });
      res.json(projects);
    } catch (error) {
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
      const userId = req.headers['user-id'] as string; // In production use proper auth middleware
      
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      if (!user.accessToken || !user.refreshToken) {
        return res.status(400).json({ error: 'Missing authentication tokens' });
      }
      
      // Create organized folder structure in Google Drive
      const googleService = new GoogleService(user.accessToken, user.refreshToken, userId);
      const folderStructure = await googleService.createProjectFolder(name);
      
      // Create project in database with all folder IDs
      const project = await Project.create({
        name,
        description,
        owner: userId,
        rootFolderId: folderStructure.rootId,
        chaptersFolderId: folderStructure.chaptersId,
        charactersFolderId: folderStructure.charactersId,
        researchFolderId: folderStructure.researchId,
        syncStatus: 'synced',
        lastSyncTime: new Date(),
      });
      
      res.status(201).json(project);
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
      
      const project = await Project.findById(id);
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Verify ownership
      if (project.owner.toString() !== userId) {
        return res.status(403).json({ error: 'Not authorized to access this project' });
      }
      
      res.json(project);
    } catch (error) {
      console.error('Error fetching project:', error);
      res.status(500).json({ error: 'Failed to fetch project' });
    }
  };
  
  handleRequest();
});

// Sync project with Google Drive
router.post('/:id/sync', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const { id } = req.params;
      const userId = req.headers['user-id'] as string;
      const { fullSync = false } = req.body;

      // Verify project ownership
      const project = await Project.findById(id);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      if (project.owner.toString() !== userId) {
        return res.status(403).json({ error: 'Not authorized to sync this project' });
      }

      // Update sync status
      project.syncStatus = 'syncing';
      await project.save();

      try {
        // Perform the sync
        await syncProject(id, userId, fullSync);
        
        // Update sync status to success
        project.syncStatus = 'synced';
        project.lastSyncTime = new Date();
        await project.save();

        res.json({ 
          success: true, 
          message: 'Project synced successfully',
          lastSyncTime: project.lastSyncTime 
        });
      } catch (syncError) {
        // Update sync status to error
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

// Delete project route
router.delete('/:id', async (req: Request, res: Response) => {
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

    // Verify ownership
    if (project.owner.toString() !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this project' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get all documents in the project
    const projectDocuments = await Document.find({ project: id });
    
    // If user has Google credentials, try to delete from Google Drive
    if (user.accessToken && user.refreshToken && project.rootFolderId) {
      try {
        const googleService = new GoogleService(user.accessToken, user.refreshToken, userId);
        
        // Delete individual documents from Google Drive
        for (const doc of projectDocuments) {
          if (doc.googleDriveId) {
            try {
              await googleService.deleteFile(doc.googleDriveId);
              console.log(`🗑️ Deleted Google Drive file: ${doc.googleDriveId}`);
            } catch (error) {
              console.error(`❌ Failed to delete Google Drive file ${doc.googleDriveId}:`, error);
              // Continue with deletion even if individual files fail
            }
          }
        }
        
        // Delete the root folder (this should delete all remaining files)
        await googleService.deleteFile(project.rootFolderId);
        console.log(`🗑️ Deleted Google Drive folder: ${project.rootFolderId}`);
      } catch (googleError) {
        console.error('❌ Failed to delete from Google Drive:', googleError);
        // Continue with local deletion even if Google Drive deletion fails
      }
    }

    // Delete all documents from database
    await Document.deleteMany({ project: id });
    console.log(`🗑️ Deleted ${projectDocuments.length} documents from database`);

    // Delete the project from database
    await Project.findByIdAndDelete(id);
    console.log(`🗑️ Deleted project: ${project.name}`);

    return res.json({ 
      success: true, 
      message: 'Project and all associated documents deleted successfully',
      deletedDocuments: projectDocuments.length
    });
  } catch (error) {
    console.error('Delete project error:', error);
    return res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;