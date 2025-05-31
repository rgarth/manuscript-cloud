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
      const userId = req.headers['user-id']; // In production use proper auth middleware
      
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      if (!user.accessToken || !user.refreshToken) {
        return res.status(400).json({ error: 'Missing authentication tokens' });
      }
      
      // Create root folder in Google Drive
      const googleService = new GoogleService(user.accessToken, user.refreshToken);
      const rootFolderId = await googleService.createFolder(name);
      
      // Create project in database
      const project = await Project.create({
        name,
        description,
        owner: userId,
        rootFolderId,
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

export default router;