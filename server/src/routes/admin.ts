// ========================================
// server/src/routes/admin.ts - FIXED
// ========================================
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { cleanupMongoData, resetAllProjects, getStats } from '../utils/cleanupMongo.js';

// Import models with explicit typing to avoid Router conflicts
const User = mongoose.model('User');

const router = express.Router();

// Simple admin authentication (improve this for production)
const requireAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.headers['user-id'] as string;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    
    const user = await User.findById(userId);
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    
    // Add your admin check logic here
    // For now, just check if it's a specific email
    if (user.email !== process.env.ADMIN_EMAIL) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    
    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
};

// GET /api/admin/stats - Database statistics
router.get('/stats', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// POST /api/admin/cleanup - Clean up invalid data
router.post('/cleanup', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    await cleanupMongoData();
    res.json({ success: true, message: 'Database cleanup completed' });
  } catch (error) {
    console.error('Admin cleanup error:', error);
    res.status(500).json({ error: 'Cleanup failed' });
  }
});

// POST /api/admin/reset - Reset all project data (dangerous!)
router.post('/reset', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { confirm } = req.body;
    if (confirm !== 'DELETE_ALL_PROJECTS') {
      res.status(400).json({ 
        error: 'Confirmation required',
        message: 'Send { "confirm": "DELETE_ALL_PROJECTS" } to confirm reset'
      });
      return;
    }
    
    await resetAllProjects();
    res.json({ success: true, message: 'All project data has been reset' });
  } catch (error) {
    console.error('Admin reset error:', error);
    res.status(500).json({ error: 'Reset failed' });
  }
});

export default router;
