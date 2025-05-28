import express from 'express';
import Project from '../models/Project';
import Document from '../models/Document';
import User from '../models/User';
import GoogleService from '../services/GoogleService';

const router = express.Router();

// Get all projects for a user
router.get('/', async (req, res) => {
  try {
    const userId = req.headers['user-id']; // In production use proper auth middleware
    const projects = await Project.find({ owner: userId });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Create new project
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;
    const userId = req.headers['user-id']; // In production use proper auth middleware
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
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
});

export default router;