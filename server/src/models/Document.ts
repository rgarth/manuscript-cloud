// server/src/models/Document.ts
import mongoose from 'mongoose';

interface IDocument extends mongoose.Document {
  project: mongoose.Types.ObjectId;
  title: string;
  documentType: 'book' | 'part' | 'chapter' | 'scene' | 'character' | 'place' | 'note' | 'research';
  parent: mongoose.Types.ObjectId | null;
  googleDocId?: string;
  googleDriveId?: string;
  synopsis?: string;
  order: number;
  metadata: {
    status?: 'draft' | 'review' | 'final' | 'published';
    tags?: string[];
    wordCount?: number;
    includeInCompile?: boolean;
    customFields?: any;
  };
}

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
    enum: [
      // Folders (organizational only)
      'book',        // Top level container
      'part',        // Optional book parts/sections
      'chapter',     // Chapter folders (contain scenes)
      
      // Documents (actual Google Docs)
      'scene',       // Individual scene docs (can be moved between chapters)
      'character',   // Character notes (no compile)
      'place',       // Location/setting notes (no compile)
      'note',        // General notes (no compile)
      'research'     // Research materials (no compile)
    ],
    default: 'scene',
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
    status: {
      type: String,
      enum: ['draft', 'review', 'final', 'published'],
      default: 'draft'
    },
    tags: [String],
    wordCount: Number,
    includeInCompile: {
      type: Boolean,
      default: false
    },
    customFields: mongoose.Schema.Types.Mixed,
  },
}, { timestamps: true });

// Add index for efficient tree queries
DocumentSchema.index({ project: 1, parent: 1, order: 1 });

// Set includeInCompile default based on document type
DocumentSchema.pre<IDocument>('save', function(next) {
  if (this.isNew && this.metadata.includeInCompile === undefined) {
    this.metadata.includeInCompile = this.documentType === 'scene';
  }
  next();
});

export default mongoose.model<IDocument>('Document', DocumentSchema);