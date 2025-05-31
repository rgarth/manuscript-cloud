// server/src/services/SyncService.ts
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

  // Full sync: rebuild database from Google Drive state
  async fullSync(): Promise<void> {
    try {
      console.log(`🔄 Starting full sync for project: ${this.projectId}`);
      
      const project = await Project.findById(this.projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      if (!project.rootFolderId) {
        throw new Error('Project missing rootFolderId - cannot sync');
      }

      // Get all files from Google Drive
      const driveFiles = await this.googleService.syncProjectFiles(project.rootFolderId);
      
      // Get current database state
      const dbDocs = await Document.find({ project: this.projectId });
      
      // Create maps for easy lookup
      const driveFileMap = new Map(driveFiles.map(f => [f.id, f]));
      const dbDocMap = new Map(dbDocs.map(d => [d.googleDriveId, d]));

      // Process each drive file
      for (const driveFile of driveFiles) {
        const dbDoc = dbDocMap.get(driveFile.id);
        
        if (dbDoc) {
          // Update existing document
          await this.updateDocumentFromDrive(dbDoc, driveFile);
        } else {
          // Create new document
          await this.createDocumentFromDrive(driveFile);
        }
      }

      // Remove documents that no longer exist in Drive
      for (const dbDoc of dbDocs) {
        if (dbDoc.googleDriveId && !driveFileMap.has(dbDoc.googleDriveId)) {
          console.log(`🗑️ Removing deleted document: ${dbDoc.title}`);
          await Document.findByIdAndDelete(dbDoc._id);
        }
      }

      // Update project last sync time
      project.lastSyncTime = new Date();
      await project.save();

      console.log(`✅ Full sync completed for project: ${this.projectId}`);
    } catch (error) {
      console.error('❌ Full sync failed:', error);
      throw error;
    }
  }

  // Incremental sync: only sync changed files
  async incrementalSync(): Promise<void> {
    try {
      const project = await Project.findById(this.projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      if (!project.rootFolderId) {
        throw new Error('Project missing rootFolderId - cannot sync');
      }

      const lastSyncTime = project.lastSyncTime || new Date(0);
      const changedFiles = await this.googleService.getChangedFiles(
        project.rootFolderId, 
        lastSyncTime
      );

      console.log(`🔄 Syncing ${changedFiles.length} changed files`);

      for (const driveFile of changedFiles) {
        if (driveFile.trashed) {
          // Handle deleted files
          await this.handleDeletedFile(driveFile.id);
        } else {
          // Handle updated/new files
          const dbDoc = await Document.findOne({ googleDriveId: driveFile.id });
          
          if (dbDoc) {
            await this.updateDocumentFromDrive(dbDoc, driveFile);
          } else {
            await this.createDocumentFromDrive(driveFile);
          }
        }
      }

      // Update last sync time
      project.lastSyncTime = new Date();
      await project.save();

      console.log(`✅ Incremental sync completed`);
    } catch (error) {
      console.error('❌ Incremental sync failed:', error);
      throw error;
    }
  }

  private async createDocumentFromDrive(driveFile: any): Promise<void> {
    try {
      const properties = driveFile.properties || {};
      
      // Extract metadata from Drive properties
      const documentType = properties['document-type'] || 'scene';
      const order = parseInt(properties['order'] || '0');
      
      // Determine parent from Drive folder structure
      const parentId = await this.findParentDocumentId(driveFile.parents?.[0]);

      const document = await Document.create({
        title: driveFile.name,
        documentType,
        parent: parentId,
        project: this.projectId,
        googleDocId: driveFile.id,
        googleDriveId: driveFile.id,
        order,
        metadata: {
          includeInCompile: documentType === 'scene',
        },
      });

      console.log(`📄 Created document from Drive: ${driveFile.name}`);
    } catch (error) {
      console.error(`❌ Failed to create document from Drive file: ${driveFile.name}`, error);
    }
  }

  private async updateDocumentFromDrive(dbDoc: any, driveFile: any): Promise<void> {
    try {
      const properties = driveFile.properties || {};
      
      // Update fields that might have changed
      dbDoc.title = driveFile.name;
      dbDoc.order = parseInt(properties['order'] || dbDoc.order.toString());
      
      // Check if parent changed (file moved)
      const newParentId = await this.findParentDocumentId(driveFile.parents?.[0]);
      if (newParentId !== dbDoc.parent?.toString()) {
        dbDoc.parent = newParentId;
        console.log(`📁 Document moved: ${driveFile.name}`);
      }

      await dbDoc.save();
    } catch (error) {
      console.error(`❌ Failed to update document: ${driveFile.name}`, error);
    }
  }

  private async handleDeletedFile(driveFileId: string): Promise<void> {
    try {
      const dbDoc = await Document.findOne({ googleDriveId: driveFileId });
      if (dbDoc) {
        await Document.findByIdAndDelete(dbDoc._id);
        console.log(`🗑️ Removed deleted document: ${dbDoc.title}`);
      }
    } catch (error) {
      console.error('❌ Failed to handle deleted file:', error);
    }
  }

  private async findParentDocumentId(driveFolderId?: string): Promise<string | null> {
    if (!driveFolderId) return null;
    
    const parentDoc = await Document.findOne({ 
      googleDriveId: driveFolderId,
      project: this.projectId 
    });
    
    return parentDoc?._id?.toString() || null;
  }
}

// Utility to trigger sync for a project
export async function syncProject(projectId: string, userId: string, fullSync = false): Promise<void> {
  try {
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(userId);
    
    if (!user?.accessToken || !user?.refreshToken) {
      throw new Error('User authentication tokens not found');
    }

    const googleService = new GoogleService(user.accessToken, user.refreshToken, userId);
    const syncService = new SyncService(googleService, projectId);

    if (fullSync) {
      await syncService.fullSync();
    } else {
      await syncService.incrementalSync();
    }
  } catch (error) {
    console.error('❌ Project sync failed:', error);
    throw error;
  }
}