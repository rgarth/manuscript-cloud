// server/src/models/Project.ts - SIMPLIFIED VERSION
import mongoose from 'mongoose';

const ProjectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  rootFolderId: {
    type: String,
    required: true,
  }, // Google Drive folder ID - all other data lives in JSON files there
}, { timestamps: true });

export default mongoose.model('Project', ProjectSchema);