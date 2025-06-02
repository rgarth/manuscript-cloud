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
  content: {
    type: String,
    default: '',
  },
  documentType: {
    type: String,
    enum: ['folder', 'part', 'chapter', 'scene', 'character', 'setting', 'note', 'research'],
    default: 'scene',
  },
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    default: null,
  },
  order: {
    type: Number,
    default: 0,
  },
  synopsis: String,
  metadata: {
    status: {
      type: String,
      enum: ['draft', 'review', 'final', 'published'],
      default: 'draft'
    },
    tags: [String],
    wordCount: { type: Number, default: 0 },
    includeInCompile: { type: Boolean, default: false },
    customFields: mongoose.Schema.Types.Mixed,
  },
}, { timestamps: true });

// Auto-update word count on save
DocumentSchema.pre('save', function(next) {
  if (this.isModified('content') && this.content != null) {
    const text = this.content.replace(/<[^>]*>/g, ''); // Strip HTML
    if (this.metadata != null) {
      this.metadata.wordCount = text.trim().split(/\s+/).length;
    }
  }
  
  if (this.isNew && this.metadata != null && this.metadata.includeInCompile === undefined) {
    this.metadata.includeInCompile = this.documentType === 'scene';
  }
  
  next();
});

export default mongoose.model('Document', DocumentSchema);