// server/src/services/SyncService.ts - JSON FILE ONLY APPROACH
import GoogleService from './GoogleService.js';

export class SyncService {
  private googleService: GoogleService;
  private projectFolderId: string;

  constructor(googleService: GoogleService, projectFolderId: string) {
    this.googleService = googleService;
    this.projectFolderId = projectFolderId;
  }

  // Simplified sync: just refresh from JSON files in Google Drive
  async syncProject(): Promise<void> {
    try {
      console.log(`🔄 Starting sync for project folder: ${this.projectFolderId}`);
      
      // Get fresh data from Google Drive JSON files (this IS the sync - no MongoDB needed)
      const projectMetadata = await this.googleService.getProject(this.projectFolderId);
      const documents = await this.googleService.getDocuments(this.projectFolderId);
      
      console.log(`📊 Found ${documents.length} documents in JSON index`);
      console.log(`✅ Sync completed for project: ${projectMetadata.name}`);
      
      return;
    } catch (error) {
      console.error('❌ Sync failed:', error);
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
      // Check project metadata file
      try {
        await this.googleService.getProject(this.projectFolderId);
        result.hasProjectMetadata = true;
      } catch (error) {
        result.errors.push(`Project metadata file issue: ${error}`);
      }

      // Check document index file
      try {
        await this.googleService.getDocuments(this.projectFolderId);
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
      const validation = await this.validateProjectStructure();

      if (!validation.hasProjectMetadata) {
        console.log('🔧 Repairing missing project metadata file...');
        await this.googleService.createProject('Untitled Project', '');
      }

      if (!validation.hasDocumentIndex) {
        console.log('🔧 Repairing missing document index file...');
        // Create empty document index by creating and deleting a temp document
        const tempDoc = await this.googleService.createDocument(
          this.projectFolderId,
          'temp-repair-doc',
          this.projectFolderId,
          'scene'
        );
        await this.googleService.deleteDocument(this.projectFolderId, tempDoc.driveId);
      }

      console.log('✅ Project structure repaired');
    } catch (error) {
      console.error('❌ Failed to repair project structure:', error);
      throw error;
    }
  }
}

// Utility functions that work with JSON files only (no MongoDB queries)
export async function syncProject(projectFolderId: string, accessToken: string, refreshToken: string, userId: string, userEmail: string): Promise<void> {
  try {
    const googleService = new GoogleService(
      accessToken, 
      refreshToken, 
      userId, 
      userEmail
    );
    const syncService = new SyncService(googleService, projectFolderId);

    // With JSON files, sync just validates the files exist and are readable
    await syncService.syncProject();
    
    console.log(`✅ Project ${projectFolderId} synced successfully`);
  } catch (error) {
    console.error('❌ Project sync failed:', error);
    throw error;
  }
}

// Utility to validate project structure
export async function validateProject(projectFolderId: string, accessToken: string, refreshToken: string, userId: string, userEmail: string): Promise<any> {
  try {
    const googleService = new GoogleService(
      accessToken, 
      refreshToken, 
      userId, 
      userEmail
    );
    const syncService = new SyncService(googleService, projectFolderId);

    return await syncService.validateProjectStructure();
  } catch (error) {
    console.error('❌ Project validation failed:', error);
    throw error;
  }
}

// Utility to repair project structure
export async function repairProject(projectFolderId: string, accessToken: string, refreshToken: string, userId: string, userEmail: string): Promise<void> {
  try {
    const googleService = new GoogleService(
      accessToken, 
      refreshToken, 
      userId, 
      userEmail
    );
    const syncService = new SyncService(googleService, projectFolderId);

    await syncService.repairProjectStructure();
  } catch (error) {
    console.error('❌ Project repair failed:', error);
    throw error;
  }
}