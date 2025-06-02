import mongoose from 'mongoose';

const ProjectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  settings: {
    wordCountGoal: { type: Number, default: 80000 },
    dailyWordGoal: { type: Number, default: 500 },
    compileSettings: {
      includeComments: { type: Boolean, default: false },
      exportFormat: { type: String, default: 'docx' },
    },
  },
  statistics: {
    totalWords: { type: Number, default: 0 },
    documentCount: { type: Number, default: 0 },
    lastBackup: Date,
  },
}, { timestamps: true });

export default mongoose.model('Project', ProjectSchema);