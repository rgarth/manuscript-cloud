// server/src/models/Project.ts
import mongoose from 'mongoose';

const ProjectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  description: String,
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // Google Drive organization
  rootFolderId: String, // Main project folder
  chaptersFolderId: String, // Chapters subfolder
  charactersFolderId: String, // Characters subfolder  
  researchFolderId: String, // Research subfolder
  
  // Sync tracking
  lastSyncTime: Date,
  syncStatus: {
    type: String,
    enum: ['synced', 'syncing', 'error', 'never'],
    default: 'never'
  },
  syncError: String,
  
  collaborators: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    role: {
      type: String,
      enum: ['viewer', 'editor', 'admin'],
      default: 'viewer',
    },
  }],
}, { timestamps: true });

export default mongoose.model('Project', ProjectSchema);