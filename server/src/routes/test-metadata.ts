// server/src/routes/test-metadata.ts - CLEAN VERSION FOR JSON METADATA
import express from 'express';
import type { Request, Response } from 'express';
import User from '../models/User.js';
import GoogleService from '../services/GoogleService.js';

const router = express.Router();

// Test creating a project with JSON metadata
router.post('/create-project', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const userId = req.headers['user-id'] as string;
      const { name, description } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }

      const user = await User.findById(userId).catch(() => null) || 
                   await User.findOne({ email: userId }).catch(() => null);
      if (!user || !user.accessToken || !user.refreshToken) {
        return res.status(400).json({ error: 'User not found or missing tokens' });
      }

      const googleService = new GoogleService(
        user.accessToken, 
        user.refreshToken, 
        userId,
        user.email
      );

      // Create project with JSON metadata
      const result = await googleService.createProject(name, description || '');

      console.log('✅ Created project with JSON metadata:', result);

      res.json({
        success: true,
        projectId: result.folderId,
        metadata: result.metadata,
        message: 'Project created with JSON metadata files in Google Drive'
      });

    } catch (error) {
      console.error('❌ Test create project failed:', error);
      res.status(500).json({ 
        error: 'Failed to create test project',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };
  
  handleRequest();
});

// Test reading project metadata
router.get('/project/:folderId', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const userId = req.headers['user-id'] as string;
      const { folderId } = req.params;

      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }

      const user = await User.findById(userId).catch(() => null) || 
                   await User.findOne({ email: userId }).catch(() => null);
      if (!user || !user.accessToken || !user.refreshToken) {
        return res.status(400).json({ error: 'User not found or missing tokens' });
      }

      const googleService = new GoogleService(
        user.accessToken, 
        user.refreshToken, 
        userId,
        user.email
      );

      // Get project metadata
      const project = await googleService.getProject(folderId);

      console.log('✅ Retrieved project metadata:', project);

      res.json({
        success: true,
        project,
        message: 'Project metadata read from JSON files in Google Drive'
      });

    } catch (error) {
      console.error('❌ Test get project failed:', error);
      res.status(500).json({ 
        error: 'Failed to get test project',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };
  
  handleRequest();
});

// Test creating a document with metadata
router.post('/project/:folderId/document', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const userId = req.headers['user-id'] as string;
      const { folderId } = req.params;
      const { title, documentType } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }

      const user = await User.findById(userId).catch(() => null) || 
                   await User.findOne({ email: userId }).catch(() => null);
      if (!user || !user.accessToken || !user.refreshToken) {
        return res.status(400).json({ error: 'User not found or missing tokens' });
      }

      const googleService = new GoogleService(
        user.accessToken, 
        user.refreshToken, 
        userId,
        user.email
      );

      // Create document with metadata
      const result = await googleService.createDocument(
        folderId, 
        title, 
        folderId, // parent folder for now
        documentType || 'scene'
      );

      console.log('✅ Created document with JSON metadata:', result);

      res.json({
        success: true,
        documentId: result.driveId,
        metadata: result.metadata,
        message: 'Document created and added to JSON index in Google Drive'
      });

    } catch (error) {
      console.error('❌ Test create document failed:', error);
      res.status(500).json({ 
        error: 'Failed to create test document',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };
  
  handleRequest();
});

// Test reading document metadata
router.get('/document/:docId', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const userId = req.headers['user-id'] as string;
      const { docId } = req.params;
      const projectId = req.query.projectId as string;

      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }

      if (!projectId) {
        return res.status(400).json({ error: 'Project ID required as query parameter' });
      }

      const user = await User.findById(userId).catch(() => null) || 
                   await User.findOne({ email: userId }).catch(() => null);
      if (!user || !user.accessToken || !user.refreshToken) {
        return res.status(400).json({ error: 'User not found or missing tokens' });
      }

      const googleService = new GoogleService(
        user.accessToken, 
        user.refreshToken, 
        userId,
        user.email
      );

      // Get document metadata from project index
      const documents = await googleService.getDocuments(projectId);
      const document = documents.find(doc => doc.id === docId);

      if (!document) {
        return res.status(404).json({ error: 'Document not found in project index' });
      }

      console.log('✅ Retrieved document metadata:', document);

      res.json({
        success: true,
        document,
        message: 'Document metadata read from JSON index in Google Drive'
      });

    } catch (error) {
      console.error('❌ Test get document failed:', error);
      res.status(500).json({ 
        error: 'Failed to get test document',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };
  
  handleRequest();
});

// Test getting full project structure
router.get('/project/:folderId/documents', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const userId = req.headers['user-id'] as string;
      const { folderId } = req.params;

      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }

      const user = await User.findById(userId).catch(() => null) || 
                   await User.findOne({ email: userId }).catch(() => null);
      if (!user || !user.accessToken || !user.refreshToken) {
        return res.status(400).json({ error: 'User not found or missing tokens' });
      }

      const googleService = new GoogleService(
        user.accessToken, 
        user.refreshToken, 
        userId,
        user.email
      );

      // Get project documents from JSON index
      const documents = await googleService.getDocuments(folderId);

      console.log('✅ Retrieved project documents:', documents.length);

      res.json({
        success: true,
        structure: {
          projectId: folderId,
          documents: documents,
          totalDocuments: documents.length
        },
        message: 'Project structure read from JSON index in Google Drive'
      });

    } catch (error) {
      console.error('❌ Test get structure failed:', error);
      res.status(500).json({ 
        error: 'Failed to get project structure',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };
  
  handleRequest();
});

export default router;