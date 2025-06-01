// ========================================
// server/src/scripts/cleanup-mongo.ts
// ========================================
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { cleanupMongoData, resetAllProjects } from '../utils/cleanupMongo.js';

dotenv.config();

async function main() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost/manuscript-cloud');
    console.log('✅ Connected to MongoDB');

    const action = process.argv[2] || 'cleanup';

    switch (action) {
      case 'cleanup':
        console.log('🧹 Running cleanup (removes invalid data)...');
        await cleanupMongoData();
        break;
        
      case 'reset':
        console.log('🔄 Running full reset (deletes all projects/documents)...');
        const confirm = process.argv[3];
        if (confirm !== '--confirm') {
          console.log('❌ Full reset requires --confirm flag');
          console.log('Usage: npm run cleanup reset --confirm');
          process.exit(1);
        }
        await resetAllProjects();
        break;
        
      case 'stats':
        console.log('📊 Showing database statistics...');
        await showStats();
        break;
        
      default:
        console.log('Usage: npm run cleanup [cleanup|reset|stats]');
        console.log('  cleanup: Remove invalid/orphaned data');
        console.log('  reset:   Delete all projects (requires --confirm)');
        console.log('  stats:   Show database statistics');
    }

  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

async function showStats() {
  const User = (await import('../models/User.js')).default;
  const Project = (await import('../models/Project.js')).default;
  const Document = (await import('../models/Document.js')).default;

  const userCount = await User.countDocuments();
  const projectCount = await Project.countDocuments();
  const documentCount = await Document.countDocuments();
  
  const projectsWithoutFolder = await Project.countDocuments({
    $or: [
      { rootFolderId: { $exists: false } },
      { rootFolderId: null },
      { rootFolderId: '' }
    ]
  });
  
  const documentsWithoutDriveId = await Document.countDocuments({
    $or: [
      { googleDriveId: { $exists: false } },
      { googleDriveId: null },
      { googleDriveId: '' }
    ]
  });

  console.log('📊 Database Statistics:');
  console.log(`   Users: ${userCount}`);
  console.log(`   Projects: ${projectCount}`);
  console.log(`   Documents: ${documentCount}`);
  console.log('');
  console.log('❌ Issues Found:');
  console.log(`   Projects without Google Drive folder: ${projectsWithoutFolder}`);
  console.log(`   Documents without Google Drive ID: ${documentsWithoutDriveId}`);
  
  if (projectsWithoutFolder > 0 || documentsWithoutDriveId > 0) {
    console.log('');
    console.log('💡 Run "npm run cleanup" to fix these issues');
  }
}

main();

// ========================================
// package.json script addition
// ========================================
/*
Add this to your server/package.json scripts:

"scripts": {
  "cleanup": "tsx src/scripts/cleanup-mongo.ts",
  "cleanup:reset": "tsx src/scripts/cleanup-mongo.ts reset --confirm",
  "cleanup:stats": "tsx src/scripts/cleanup-mongo.ts stats"
}
*/

// ========================================
// server/src/routes/admin.ts - OPTIONAL ADMIN ENDPOINTS
// ========================================
import express from 'express';
import type { Request, Response } from 'express';
import { cleanupMongoData, resetAllProjects } from '../utils/cleanupMongo.js';
import User from '../models/User.js';

const router = express.Router();

// Simple admin authentication (improve this for production)
const requireAdmin = async (req: Request, res: Response, next: any) => {
  const userId = req.headers['user-id'] as string;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const user = await User.findById(userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }
  
  // Add your admin check logic here
  // For now, just check if it's a specific email
  if (user.email !== process.env.ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  next();
};

// GET /api/admin/stats - Database statistics
router.get('/stats', requireAdmin, async (req: Request, res: Response) => {
  try {
    const Project = (await import('../models/Project.js')).default;
    const Document = (await import('../models/Document.js')).default;

    const userCount = await User.countDocuments();
    const projectCount = await Project.countDocuments();
    const documentCount = await Document.countDocuments();
    
    const projectsWithoutFolder = await Project.countDocuments({
      $or: [
        { rootFolderId: { $exists: false } },
        { rootFolderId: null },
        { rootFolderId: '' }
      ]
    });
    
    const documentsWithoutDriveId = await Document.countDocuments({
      $or: [
        { googleDriveId: { $exists: false } },
        { googleDriveId: null },
        { googleDriveId: '' }
      ]
    });

    res.json({
      totals: {
        users: userCount,
        projects: projectCount,
        documents: documentCount
      },
      issues: {
        projectsWithoutFolder,
        documentsWithoutDriveId
      },
      needsCleanup: projectsWithoutFolder > 0 || documentsWithoutDriveId > 0
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// POST /api/admin/cleanup - Clean up invalid data
router.post('/cleanup', requireAdmin, async (req: Request, res: Response) => {
  try {
    await cleanupMongoData();
    res.json({ success: true, message: 'Database cleanup completed' });
  } catch (error) {
    console.error('Admin cleanup error:', error);
    res.status(500).json({ error: 'Cleanup failed' });
  }
});

// POST /api/admin/reset - Reset all project data (dangerous!)
router.post('/reset', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { confirm } = req.body;
    if (confirm !== 'DELETE_ALL_PROJECTS') {
      return res.status(400).json({ 
        error: 'Confirmation required',
        message: 'Send { "confirm": "DELETE_ALL_PROJECTS" } to confirm reset'
      });
    }
    
    await resetAllProjects();
    res.json({ success: true, message: 'All project data has been reset' });
  } catch (error) {
    console.error('Admin reset error:', error);
    res.status(500).json({ error: 'Reset failed' });
  }
});

export default router;

// ========================================
// UPDATED server/src/index.ts - Add admin routes
// ========================================
/*
Add this import and route to your server/src/index.ts:

import adminRoutes from './routes/admin.js';

// Register routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/test', testMetadataRoutes);
app.use('/api/admin', adminRoutes); // ADD THIS LINE
*/
