import mongoose from 'mongoose';
import Project from '../models/Project.js';
import Document from '../models/Document.js';
import User from '../models/User.js';

export async function cleanupMongoData(): Promise<void> {
  console.log('🧹 Starting MongoDB cleanup...');
  
  try {
    // 1. Clean up projects without rootFolderId
    const projectsWithoutFolder = await Project.find({ 
      $or: [
        { rootFolderId: { $exists: false } },
        { rootFolderId: null },
        { rootFolderId: '' }
      ]
    });
    
    console.log(`Found ${projectsWithoutFolder.length} projects without Google Drive folders`);
    
    if (projectsWithoutFolder.length > 0) {
      console.log('🗑️ Deleting projects without Google Drive connection...');
      await Project.deleteMany({ 
        _id: { $in: projectsWithoutFolder.map(p => p._id) }
      });
      
      // Also delete related documents
      await Document.deleteMany({ 
        project: { $in: projectsWithoutFolder.map(p => p._id) }
      });
    }
    
    // 2. Clean up documents without googleDriveId
    const documentsWithoutDriveId = await Document.find({
      $or: [
        { googleDriveId: { $exists: false } },
        { googleDriveId: null },
        { googleDriveId: '' }
      ]
    });
    
    console.log(`Found ${documentsWithoutDriveId.length} documents without Google Drive IDs`);
    
    if (documentsWithoutDriveId.length > 0) {
      await Document.deleteMany({
        _id: { $in: documentsWithoutDriveId.map(d => d._id) }
      });
    }
    
    // 3. Remove orphaned documents (projects that no longer exist)
    const orphanedDocs = await Document.find({
      project: { $nin: await Project.distinct('_id') }
    });
    
    console.log(`Found ${orphanedDocs.length} orphaned documents`);
    
    if (orphanedDocs.length > 0) {
      await Document.deleteMany({
        _id: { $in: orphanedDocs.map(d => d._id) }
      });
    }
    
    // 4. Summary
    const finalProjectCount = await Project.countDocuments();
    const finalDocumentCount = await Document.countDocuments();
    const userCount = await User.countDocuments();
    
    console.log('✅ MongoDB cleanup completed!');
    console.log(`📊 Final counts:`);
    console.log(`   Users: ${userCount}`);
    console.log(`   Projects: ${finalProjectCount}`);
    console.log(`   Documents (cached): ${finalDocumentCount}`);
    
  } catch (error) {
    console.error('❌ MongoDB cleanup failed:', error);
    throw error;
  }
}

export async function resetAllProjects(): Promise<void> {
  console.log('🔄 Resetting all project data...');
  
  try {
    const deletedDocs = await Document.deleteMany({});
    const deletedProjects = await Project.deleteMany({});
    
    console.log(`🗑️ Deleted ${deletedDocs.deletedCount} documents`);
    console.log(`🗑️ Deleted ${deletedProjects.deletedCount} projects`);
    console.log('✅ All project data reset - ready for fresh start!');
  } catch (error) {
    console.error('❌ Reset failed:', error);
    throw error;
  }
}

export async function getStats(): Promise<{
  totals: { users: number; projects: number; documents: number };
  issues: { projectsWithoutFolder: number; documentsWithoutDriveId: number };
  needsCleanup: boolean;
}> {
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

  return {
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
  };
}
