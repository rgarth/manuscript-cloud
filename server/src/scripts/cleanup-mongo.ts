import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { cleanupMongoData, resetAllProjects, getStats } from '../utils/cleanupMongo.js';

dotenv.config();

async function main(): Promise<void> {
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

async function showStats(): Promise<void> {
  const stats = await getStats();

  console.log('📊 Database Statistics:');
  console.log(`   Users: ${stats.totals.users}`);
  console.log(`   Projects: ${stats.totals.projects}`);
  console.log(`   Documents: ${stats.totals.documents}`);
  console.log('');
  console.log('❌ Issues Found:');
  console.log(`   Projects without Google Drive folder: ${stats.issues.projectsWithoutFolder}`);
  console.log(`   Documents without Google Drive ID: ${stats.issues.documentsWithoutDriveId}`);
  
  if (stats.needsCleanup) {
    console.log('');
    console.log('💡 Run "npm run cleanup" to fix these issues');
  } else {
    console.log('');
    console.log('✅ No issues found - database is clean!');
  }
}

main();