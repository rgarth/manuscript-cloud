import mongoose from 'mongoose';

const DocumentSchema = new mongoose.Schema({
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  documentType: {
    type: String,
    enum: ['folder', 'text', 'character', 'setting', 'note', 'research'],
    default: 'text',
  },
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    default: null,
  },
  googleDocId: String,
  googleDriveId: String,
  synopsis: String,
  order: {
    type: Number,
    default: 0,
  },
  metadata: {
    status: String,
    tags: [String],
    wordCount: Number,
    customFields: mongoose.Schema.Types.Mixed,
  },
}, { timestamps: true });

export default mongoose.model('Document', DocumentSchema);