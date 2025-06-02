// server/src/models/Document.ts - UPDATED WITH CONTENT STORAGE
import mongoose from 'mongoose';

interface IDocument extends mongoose.Document {
  project: mongoose.Types.ObjectId;
  title: string;
  documentType: 'folder' | 'part' | 'chapter' | 'scene' | 'character' | 'setting' | 'note' | 'research';
  parent: mongoose.Types.ObjectId | null;
  googleDocId?: string;
  googleDriveId?: string;
  synopsis?: string;
  parentGoogleId?: string; 
  order: number;
  lastSyncedAt?: Date;
  
  // NEW: Content storage fields
  content: string;
  lastEditedAt: Date;
  
  metadata: {
    status?: 'draft' | 'review' | 'final' | 'published';
    tags?: string[];
    wordCount?: number;
    characterCount?: number;
    includeInCompile?: boolean;
    customFields?: any;
    
    // NEW: Editor-specific metadata
    editorState?: any; // For storing TinyMCE state if needed
    writingGoals?: {
      targetWords?: number;
      dailyGoal?: number;
    };
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
      'folder',      // Generic folder
      'part',        // Optional book parts/sections
      'chapter',     // Chapter folders (contain scenes)
      
      // Documents (actual content)
      'scene',       // Individual scene docs
      'character',   // Character notes
      'setting',     // Location/setting notes
      'note',        // General notes
      'research'     // Research materials
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
  parentGoogleId: String, 
  order: {
    type: Number,
    default: 0,
  },
  lastSyncedAt: Date,
  
  // NEW: Content storage
  content: {
    type: String,
    default: '',
  },
  lastEditedAt: {
    type: Date,
    default: Date.now,
  },
  
  metadata: {
    status: {
      type: String,
      enum: ['draft', 'review', 'final', 'published'],
      default: 'draft'
    },
    tags: [String],
    wordCount: {
      type: Number,
      default: 0,
    },
    characterCount: {
      type: Number,
      default: 0,
    },
    includeInCompile: {
      type: Boolean,
      default: false
    },
    customFields: mongoose.Schema.Types.Mixed,
    
    // NEW: Editor-specific metadata
    editorState: mongoose.Schema.Types.Mixed,
    writingGoals: {
      targetWords: Number,
      dailyGoal: Number,
    },
  },
}, { 
  timestamps: true,
  // Optimize for content queries
  collection: 'documents'
});

// Add indexes for efficient queries
DocumentSchema.index({ project: 1, parent: 1, order: 1 });
DocumentSchema.index({ project: 1, documentType: 1 });
DocumentSchema.index({ 'metadata.wordCount': 1 });
DocumentSchema.index({ lastEditedAt: -1 });

// NEW: Middleware to update word count and character count on save
DocumentSchema.pre<IDocument>('save', function(next) {
  if (this.isModified('content')) {
    // Update word count
    const plainText = this.content.replace(/<[^>]*>/g, '').trim();
    this.metadata.wordCount = plainText ? plainText.split(/\s+/).length : 0;
    
    // Update character count
    this.metadata.characterCount = plainText.length;
    
    // Update last edited time
    this.lastEditedAt = new Date();
  }
  
  // Set includeInCompile default based on document type
  if (this.isNew && this.metadata.includeInCompile === undefined) {
    this.metadata.includeInCompile = this.documentType === 'scene';
  }
  
  next();
});

// NEW: Instance method to get reading time estimate
DocumentSchema.methods.getReadingTimeMinutes = function(): number {
  const wordsPerMinute = 200; // Average reading speed
  return Math.ceil((this.metadata.wordCount || 0) / wordsPerMinute);
};

// NEW: Instance method to get writing progress
DocumentSchema.methods.getWritingProgress = function(): {
  wordsWritten: number;
  targetWords: number;
  progressPercentage: number;
} {
  const wordsWritten = this.metadata.wordCount || 0;
  const targetWords = this.metadata.writingGoals?.targetWords || 0;
  const progressPercentage = targetWords > 0 ? Math.round((wordsWritten / targetWords) * 100) : 0;
  
  return {
    wordsWritten,
    targetWords,
    progressPercentage: Math.min(progressPercentage, 100)
  };
};

// NEW: Static method to get project statistics
DocumentSchema.statics.getProjectStats = async function(projectId: string) {
  const stats = await this.aggregate([
    { $match: { project: new mongoose.Types.ObjectId(projectId) } },
    {
      $group: {
        _id: null,
        totalWords: { $sum: '$metadata.wordCount' },
        totalCharacters: { $sum: '$metadata.characterCount' },
        documentCount: { $sum: 1 },
        sceneCount: {
          $sum: { $cond: [{ $eq: ['$documentType', 'scene'] }, 1, 0] }
        },
        compilableWords: {
          $sum: {
            $cond: [
              { $eq: ['$metadata.includeInCompile', true] },
              '$metadata.wordCount',
              0
            ]
          }
        },
        lastEdited: { $max: '$lastEditedAt' },
        documentsByType: {
          $push: {
            type: '$documentType',
            words: '$metadata.wordCount'
          }
        }
      }
    }
  ]);
  
  return stats[0] || {
    totalWords: 0,
    totalCharacters: 0,
    documentCount: 0,
    sceneCount: 0,
    compilableWords: 0,
    lastEdited: null,
    documentsByType: []
  };
};

export default mongoose.model<IDocument>('Document', DocumentSchema);