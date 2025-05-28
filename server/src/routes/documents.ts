import express from 'express';
import Document from '../models/Document';
import Project from '../models/Project';
import User from '../models/User';
import GoogleService from '../services/GoogleService';

const router = express.Router();

// Get all documents for a project
router.get('/project/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const documents = await Document.find({ project: projectId });
    res.json(documents);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// Create new document
router.post('/', async (req, res) => {
  try {
    const { title, documentType, parentId, projectId, synopsis } = req.body;
    const userId = req.headers['user-id']; // In production use proper auth middleware
    
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Check project ownership
    if (project.owner.toString() !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    const user = await User.findById(userId);
    const googleService = new GoogleService(user.accessToken, user.refreshToken);
    
    // Find parent folder ID in Google Drive
    let parentFolderId = project.rootFolderId;
    if (parentId) {
      const parentDoc = await Document.findById(parentId);
      if (parentDoc) {
        parentFolderId = parentDoc.googleDriveId || project.rootFolderId;
      }
    }
    
    let googleDocId, googleDriveId;
    
    if (documentType === 'folder') {
      googleDriveId = await googleService.createFolder(title, parentFolderId);
    } else {
      const docInfo = await googleService.createDocument(title, parentFolderId);
      googleDriveId = docInfo.driveId;
      googleDocId = docInfo.docId;
    }
    
    // Get existing docs count for ordering
    const siblingDocsCount = await Document.countDocuments({ 
      project: projectId,
      parent: parentId || null
    });
    
    // Create document in database
    const document = await Document.create({
      title,
      documentType,
      parent: parentId || null,
      project: projectId,
      googleDocId,
      googleDriveId,
      synopsis,
      order: siblingDocsCount,
    });
    
    res.status(201).json(document);
  } catch (error) {
    console.error('Document creation error:', error);
    res.status(500).json({ error: 'Failed to create document' });
  }
});

// Get document content
router.get('/:id/content', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.headers['user-id']; // In production use proper auth middleware
    
    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    if (!document.googleDocId) {
      return res.status(400).json({ error: 'Document has no content' });
    }
    
    const project = await Project.findById(document.project);
    if (project.owner.toString() !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    const user = await User.findById(userId);
    const googleService = new GoogleService(user.accessToken, user.refreshToken);
    
    const content = await googleService.getDocumentContent(document.googleDocId);
    res.json(content);
  } catch (error) {
    console.error('Fetch document content error:', error);
    res.status(500).json({ error: 'Failed to fetch document content' });
  }
});

export default router;