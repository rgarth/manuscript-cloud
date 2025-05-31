// server/src/services/GoogleService.ts - REPLACE YOUR EXISTING FILE
import { google } from 'googleapis';
import User from '../models/User.js';

class GoogleService {
  private oauth2Client: any;
  private drive: any;
  private docs: any;
  private userId: string;
  private APP_FOLDER_NAME = 'Manuscript Cloud';

  constructor(accessToken: string, refreshToken: string, userId: string) {
    this.userId = userId;
    
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    
    this.oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    // Set up auto-refresh
    this.oauth2Client.on('tokens', async (tokens: any) => {
      console.log('🔄 Refreshing Google tokens for user:', this.userId);
      
      try {
        const user = await User.findById(this.userId);
        if (user) {
          user.accessToken = tokens.access_token;
          if (tokens.refresh_token) {
            user.refreshToken = tokens.refresh_token;
          }
          user.tokenExpiry = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
          await user.save();
          console.log('✅ Tokens updated successfully');
        }
      } catch (error) {
        console.error('❌ Failed to update tokens in database:', error);
      }
    });

    this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
    this.docs = google.docs({ version: 'v1', auth: this.oauth2Client });
  }

  // Create the main app folder if it doesn't exist
  async ensureAppFolder(): Promise<string> {
    try {
      // Check if app folder already exists
      const response = await this.drive.files.list({
        q: `name='${this.APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
      });

      if (response.data.files.length > 0) {
        return response.data.files[0].id;
      }

      // Create the app folder
      const folderResponse = await this.drive.files.create({
        requestBody: {
          name: this.APP_FOLDER_NAME,
          mimeType: 'application/vnd.google-apps.folder',
          description: 'Manuscript Cloud - Writing Project Management',
        },
        fields: 'id',
      });

      console.log(`📁 Created app folder: ${this.APP_FOLDER_NAME}`);
      return folderResponse.data.id;
    } catch (error) {
      console.error('❌ Failed to ensure app folder:', error);
      throw error;
    }
  }

  // Create project folder with proper structure
  async createProjectFolder(projectName: string): Promise<{
    rootId: string;
    chaptersId: string;
    charactersId: string;
    researchId: string;
  }> {
    try {
      const appFolderId = await this.ensureAppFolder();

      // Create project root folder
      const projectFolder = await this.drive.files.create({
        requestBody: {
          name: projectName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [appFolderId],
          description: `Manuscript Cloud Project: ${projectName}`,
          properties: {
            'manuscript-cloud': 'true',
            'project-type': 'root',
            'created-by': this.userId,
          },
        },
        fields: 'id',
      });

      const projectId = projectFolder.data.id;

      // Create organized subfolders
      const [chaptersFolder, charactersFolder, researchFolder] = await Promise.all([
        this.createSubfolder('Chapters', projectId, 'chapters'),
        this.createSubfolder('Characters', projectId, 'characters'),
        this.createSubfolder('Research & Notes', projectId, 'research'),
      ]);

      return {
        rootId: projectId,
        chaptersId: chaptersFolder,
        charactersId: charactersFolder,
        researchId: researchFolder,
      };
    } catch (error) {
      console.error('❌ Failed to create project structure:', error);
      throw error;
    }
  }

  private async createSubfolder(name: string, parentId: string, type: string): Promise<string> {
    const response = await this.drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
        properties: {
          'manuscript-cloud': 'true',
          'folder-type': type,
        },
      },
      fields: 'id',
    });
    return response.data.id;
  }

  // LEGACY METHOD - kept for backward compatibility
  async createFolder(name: string, parentId?: string): Promise<string> {
    try {
      const fileMetadata = {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : undefined,
        properties: {
          'manuscript-cloud': 'true',
        },
      };
      
      const response = await this.drive.files.create({
        requestBody: fileMetadata,
        fields: 'id',
      });
      
      console.log(`📁 Created folder "${name}" with ID: ${response.data.id}`);
      return response.data.id as string;
    } catch (error) {
      console.error('❌ Failed to create folder:', error);
      throw new Error(`Failed to create folder: ${error}`);
    }
  }

  // Create document with proper metadata
  async createDocument(
    title: string, 
    parentId?: string, 
    documentType: string = 'scene',
    projectId?: string,
    order: number = 0
  ): Promise<{ driveId: string; docId: string }> {
    try {
      const properties: any = {
        'manuscript-cloud': 'true',
        'document-type': documentType,
        'order': order.toString(),
        'created-by': this.userId,
      };

      if (projectId) {
        properties['project-id'] = projectId;
      }

      const response = await this.drive.files.create({
        requestBody: {
          name: title,
          mimeType: 'application/vnd.google-apps.document',
          parents: parentId ? [parentId] : undefined,
          description: `Manuscript Cloud ${documentType}: ${title}`,
          properties,
        },
        fields: 'id',
      });

      console.log(`📄 Created document "${title}" with ID: ${response.data.id}`);
      return { 
        driveId: response.data.id,
        docId: response.data.id
      };
    } catch (error) {
      console.error('❌ Failed to create document:', error);
      throw new Error(`Failed to create document: ${error}`);
    }
  }

  // Get document content
  async getDocumentContent(docId: string): Promise<any> {
    try {
      const response = await this.docs.documents.get({ 
        documentId: docId 
      });
      
      console.log(`📖 Retrieved content for document: ${docId}`);
      return response.data;
    } catch (error) {
      console.error('❌ Failed to get document content:', error);
      throw new Error(`Failed to get document content: ${error}`);
    }
  }

  // Sync: Get all project files from Google Drive
  async syncProjectFiles(projectFolderId: string): Promise<any[]> {
    try {
      // Get all files in project folder and subfolders recursively
      const allFiles: any[] = [];
      await this.getAllFilesRecursive(projectFolderId, allFiles);
      
      // Filter only our app files
      return allFiles.filter(file => 
        file.properties && file.properties['manuscript-cloud'] === 'true'
      );
    } catch (error) {
      console.error('❌ Failed to sync project files:', error);
      throw error;
    }
  }

  private async getAllFilesRecursive(folderId: string, allFiles: any[]): Promise<void> {
    const response = await this.drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, parents, properties, description, createdTime, modifiedTime)',
    });

    for (const file of response.data.files || []) {
      allFiles.push(file);
      
      // If it's a folder, get its contents too
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        await this.getAllFilesRecursive(file.id, allFiles);
      }
    }
  }

  // Delete a file
  async deleteFile(fileId: string): Promise<void> {
    try {
      await this.drive.files.delete({
        fileId: fileId
      });
      
      console.log(`🗑️ Deleted file: ${fileId}`);
    } catch (error) {
      console.error('❌ Failed to delete file:', error);
      throw new Error(`Failed to delete file: ${error}`);
    }
  }

  // Test API connectivity
  async testConnection(): Promise<boolean> {
    try {
      await this.drive.about.get({ fields: 'user' });
      console.log('✅ Google Drive API connection successful');
      return true;
    } catch (error) {
      console.error('❌ Google Drive API connection failed:', error);
      return false;
    }
  }
}

export default GoogleService;