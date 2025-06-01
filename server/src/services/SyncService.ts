// server/src/services/SyncService.ts - UPDATED FOR JSON FILE ARCHITECTURE
import Document from '../models/Document.js';
import Project from '../models/Project.js';
import GoogleService from './GoogleService.js';

export class SyncService {
  private googleService: GoogleService;
  private projectId: string;

  constructor(googleService: GoogleService, projectId: string) {
    this.googleService = googleService;
    this.projectId = projectId;
  }

  // Simplified sync: just refresh from JSON files in Google Drive
  async syncProject(): Promise<void> {
    try {
      console.log(`🔄 Starting sync for project: ${this.projectId}`);
      
      const project = await Project.findById(this.projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      if (!project.rootFolderId) {
        throw new Error('Project missing rootFolderId - cannot sync');
      }

      // Get fresh data from Google Drive JSON files
      const projectMetadata = await this.googleService.getProject(project.rootFolderId);
      const documents = await this.googleService.getDocuments(project.rootFolderId);
      
      console.log(`📊 Found ${documents.length} documents in JSON index`);

      // Update local database if needed (optional - for caching/performance)
      await this.updateLocalDatabase(project, projectMetadata, documents);

      // Update project sync status
      project.lastSyncTime = new Date();
      project.syncStatus = 'synced';
      project.syncError = undefined;
      await project.save();

      console.log(`✅ Sync completed for project: ${this.projectId}`);
    } catch (error) {
      console.error('❌ Sync failed:', error);
      
      // Update project sync status to error
      const project = await Project.findById(this.projectId);
      if (project) {
        project.syncStatus = 'error';
        project.syncError = error instanceof Error ? error.message : 'Unknown sync error';
        await project.save();
      }
      
      throw error;
    }
  }

  // Full sync is the same as regular sync since we always read from source of truth (JSON files)
  async fullSync(): Promise<void> {
    return this.syncProject();
  }

  // Incremental sync is also the same - JSON files are always current
  async incrementalSync(): Promise<void> {
    return this.syncProject();
  }

  // Optional: Update local database for caching (you may not need this)
  private async updateLocalDatabase(
    project: any, 
    projectMetadata: any, 
    documents: any[]
  ): Promise<void> {
    try {
      // Update project metadata in local database (optional)
      if (projectMetadata.description !== project.description) {
        project.description = projectMetadata.description;
        console.log(`📝 Updated project description`);
      }

      // Sync documents to local database (optional - for search/performance)
      const localDocs = await Document.find({ project: this.projectId });
      const localDocMap = new Map(localDocs.map(doc => [doc.googleDriveId, doc]));

      for (const driveDoc of documents) {
        const localDoc = localDocMap.get(driveDoc.id);
        
        if (localDoc) {
          // Update existing document
          if (localDoc.title !== driveDoc.title || 
              localDoc.documentType !== driveDoc.documentType) {
            localDoc.title = driveDoc.title;
            localDoc.documentType = driveDoc.documentType;
            localDoc.order = driveDoc.order;
            localDoc.synopsis = driveDoc.synopsis;
            await localDoc.save();
            console.log(`📝 Updated local document: ${driveDoc.title}`);
          }
        } else {
          // Create new local document
          await Document.create({
            title: driveDoc.title,
            documentType: driveDoc.documentType,
            project: this.projectId,
            googleDocId: driveDoc.id,
            googleDriveId: driveDoc.id,
            order: driveDoc.order,
            synopsis: driveDoc.synopsis,
            metadata: {
              includeInCompile: driveDoc.includeInCompile,
              status: driveDoc.status,
              tags: driveDoc.tags,
            },
          });
          console.log(`📄 Created local document: ${driveDoc.title}`);
        }
      }

      // Remove local documents that no longer exist in Drive
      const driveDocIds = new Set(documents.map(doc => doc.id));
      for (const localDoc of localDocs) {
        if (localDoc.googleDriveId && !driveDocIds.has(localDoc.googleDriveId)) {
          await Document.findByIdAndDelete(localDoc._id);
          console.log(`🗑️ Removed local document: ${localDoc.title}`);
        }
      }

    } catch (error) {
      console.warn('⚠️ Failed to update local database (non-critical):', error);
      // Don't throw - this is optional caching
    }
  }

  // Validate that JSON files exist and are readable
  async validateProjectStructure(): Promise<{
    hasProjectMetadata: boolean;
    hasDocumentIndex: boolean;
    errors: string[];
  }> {
    const result = {
      hasProjectMetadata: false,
      hasDocumentIndex: false,
      errors: [] as string[]
    };

    try {
      const project = await Project.findById(this.projectId);
      if (!project?.rootFolderId) {
        result.errors.push('Project missing rootFolderId');
        return result;
      }

      // Check project metadata file
      try {
        await this.googleService.getProject(project.rootFolderId);
        result.hasProjectMetadata = true;
      } catch (error) {
        result.errors.push(`Project metadata file issue: ${error}`);
      }

      // Check document index file
      try {
        await this.googleService.getDocuments(project.rootFolderId);
        result.hasDocumentIndex = true;
      } catch (error) {
        result.errors.push(`Document index file issue: ${error}`);
      }

    } catch (error) {
      result.errors.push(`Validation failed: ${error}`);
    }

    return result;
  }

  // Repair missing JSON files
  async repairProjectStructure(): Promise<void> {
    try {
      const project = await Project.findById(this.projectId);
      if (!project?.rootFolderId) {
        throw new Error('Project missing rootFolderId');
      }

      const validation = await this.validateProjectStructure();

      if (!validation.hasProjectMetadata) {
        console.log('🔧 Repairing missing project metadata file...');
        await this.googleService.createProject(project.name, project.description || '');
      }

      if (!validation.hasDocumentIndex) {
        console.log('🔧 Repairing missing document index file...');
        // Create empty document index
        const emptyIndex: any[] = [];
        // This would need a method to save document index directly
        // For now, creating a document and removing it will create the index
        const tempDoc = await this.googleService.createDocument(
          project.rootFolderId,
          'temp-repair-doc',
          project.rootFolderId,
          'scene'
        );
        await this.googleService.deleteDocument(project.rootFolderId, tempDoc.driveId);
      }

      console.log('✅ Project structure repaired');
    } catch (error) {
      console.error('❌ Failed to repair project structure:', error);
      throw error;
    }
  }
}

// Utility to trigger sync for a project with JSON file architecture
export async function syncProject(projectId: string, userId: string, fullSync = false): Promise<void> {
  try {
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(userId);
    
    if (!user?.accessToken || !user?.refreshToken) {
      throw new Error('User authentication tokens not found');
    }

    const googleService = new GoogleService(
      user.accessToken, 
      user.refreshToken, 
      userId, 
      user.email
    );
    const syncService = new SyncService(googleService, projectId);

    // With JSON files, full sync and incremental sync are the same
    await syncService.syncProject();
    
    console.log(`✅ Project ${projectId} synced successfully`);
  } catch (error) {
    console.error('❌ Project sync failed:', error);
    throw error;
  }
}

// Utility to validate project structure
export async function validateProject(projectId: string, userId: string): Promise<any> {
  try {
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(userId);
    
    if (!user?.accessToken || !user?.refreshToken) {
      throw new Error('User authentication tokens not found');
    }

    const googleService = new GoogleService(
      user.accessToken, 
      user.refreshToken, 
      userId, 
      user.email
    );
    const syncService = new SyncService(googleService, projectId);

    return await syncService.validateProjectStructure();
  } catch (error) {
    console.error('❌ Project validation failed:', error);
    throw error;
  }
}

// Utility to repair project structure
export async function repairProject(projectId: string, userId: string): Promise<void> {
  try {
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(userId);
    
    if (!user?.accessToken || !user?.refreshToken) {
      throw new Error('User authentication tokens not found');
    }

    const googleService = new GoogleService(
      user.accessToken, 
      user.refreshToken, 
      userId, 
      user.email
    );
    const syncService = new SyncService(googleService, projectId);

    await syncService.repairProjectStructure();
  } catch (error) {
    console.error('❌ Project repair failed:', error);
    throw error;
  }
}