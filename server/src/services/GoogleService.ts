// server/src/services/GoogleService.ts - JSON FILE APPROACH
import { google } from 'googleapis';
import User from '../models/User.js';

interface ProjectMetadata {
  name: string;
  description?: string;
  createdBy?: string;
  createdAt?: string;
  version: string;
  settings?: {
    compileSettings?: any;
    exportFormats?: string[];
    wordCountGoals?: any;
    targetLength?: number;
  };
  collaborators?: Array<{
    email: string;
    role: 'viewer' | 'editor' | 'admin';
  }>;
  structure?: {
    chaptersId: string;
    charactersId: string;
    researchId: string;
  };
  statistics?: {
    totalWords?: number;
    documentCount?: number;
    lastUpdated?: string;
  };
}

interface DocumentMetadata {
  id: string;
  title: string;
  documentType: string;
  parentId?: string;
  order: number;
  synopsis?: string;
  status?: 'draft' | 'review' | 'final' | 'published';
  tags?: string[];
  includeInCompile?: boolean;
  wordCount?: number;
  wordCountGoal?: number;
  createdAt: string;
  updatedAt: string;
  customFields?: Record<string, any>;
}

export default class GoogleService {
  private oauth2Client: any;
  private drive: any;
  private docs: any;
  private userId: string;
  private userEmail: string;
  private APP_FOLDER_NAME = 'Manuscript Cloud';
  private PROJECT_METADATA_FILE = '.manuscript-project.json';
  private DOCUMENT_INDEX_FILE = '.document-index.json';

  constructor(
    accessToken: string | undefined,
    refreshToken: string | undefined,
    userId: string,
    userEmail: string = ''
  ) {
    this.userId = userId;
    this.userEmail = userEmail;
    
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    
    this.oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    this.oauth2Client.on('tokens', async (tokens: any) => {
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

  // ===========================================
  // PROJECT MANAGEMENT WITH JSON FILES
  // ===========================================

  async createProject(name: string, description: string = ''): Promise<{
    folderId: string;
    metadata: ProjectMetadata;
  }> {
    try {
      const appFolderId = await this.ensureAppFolder();

      // Create project root folder
      const projectFolder = await this.drive.files.create({
        requestBody: {
          name,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [appFolderId],
          description: `Manuscript Cloud Project: ${name}`,
        },
        fields: 'id',
      });

      const projectId = projectFolder.data.id;

      // Create organized subfolders
      const [chaptersFolder, charactersFolder, researchFolder] = await Promise.all([
        this.createFolder('Chapters', projectId),
        this.createFolder('Characters', projectId),
        this.createFolder('Research & Notes', projectId),
      ]);

      // Create project metadata
      const metadata: ProjectMetadata = {
        name,
        description,
        createdBy: this.userEmail,
        createdAt: new Date().toISOString(),
        version: '1.0',
        settings: {
          compileSettings: { includeComments: false },
          exportFormats: ['docx'],
          wordCountGoals: { daily: 500, total: 80000 }
        },
        collaborators: [],
        structure: {
          chaptersId: chaptersFolder,
          charactersId: charactersFolder,
          researchId: researchFolder,
        },
        statistics: {
          totalWords: 0,
          documentCount: 0,
          lastUpdated: new Date().toISOString()
        }
      };

      // Save metadata to JSON file
      await this.saveProjectMetadata(projectId, metadata);

      // Initialize empty document index
      await this.saveDocumentIndex(projectId, []);

      console.log(`📁 Created project "${name}" with JSON metadata`);
      return { folderId: projectId, metadata };
    } catch (error) {
      console.error('❌ Failed to create project:', error);
      throw error;
    }
  }

  async getProject(folderId: string): Promise<ProjectMetadata> {
    try {
      return await this.loadProjectMetadata(folderId);
    } catch (error) {
      console.error('❌ Failed to get project:', error);
      throw error;
    }
  }

  async updateProject(folderId: string, updates: Partial<ProjectMetadata>): Promise<ProjectMetadata> {
    try {
      const currentMetadata = await this.loadProjectMetadata(folderId);
      const updatedMetadata: ProjectMetadata = {
        ...currentMetadata,
        ...updates,
        statistics: {
          totalWords: 0,
          documentCount: 0,
          lastUpdated: new Date().toISOString(),
          ...currentMetadata.statistics,
          ...updates.statistics,
        }
      };

      await this.saveProjectMetadata(folderId, updatedMetadata);
      console.log(`📝 Updated project metadata for: ${folderId}`);
      return updatedMetadata;
    } catch (error) {
      console.error('❌ Failed to update project:', error);
      throw error;
    }
  }

  // ===========================================
  // DOCUMENT MANAGEMENT WITH JSON INDEX
  // ===========================================

  async createDocument(
    projectId: string,
    title: string, 
    parentId: string, 
    documentType: string = 'scene'
  ): Promise<{ driveId: string; metadata: DocumentMetadata }> {
    try {
      let driveId: string;

      if (documentType === 'folder') {
        // Create folder
        driveId = await this.createFolder(title, parentId);
      } else {
        // Create Google Doc
        const response = await this.drive.files.create({
          requestBody: {
            name: title,
            mimeType: 'application/vnd.google-apps.document',
            parents: [parentId],
          },
          fields: 'id',
        });
        driveId = response.data.id;
      }

      // Create document metadata
      const metadata: DocumentMetadata = {
        id: driveId,
        title,
        documentType,
        parentId: parentId === projectId ? undefined : parentId,
        order: Date.now(), // Simple ordering - could be improved
        status: 'draft',
        includeInCompile: documentType === 'scene',
        wordCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: [],
      };

      // Add to document index
      await this.addDocumentToIndex(projectId, metadata);

      console.log(`📄 Created ${documentType} "${title}" with JSON metadata`);
      return { driveId, metadata };
    } catch (error) {
      console.error('❌ Failed to create document:', error);
      throw error;
    }
  }

  async getDocuments(projectId: string): Promise<DocumentMetadata[]> {
    try {
      return await this.loadDocumentIndex(projectId);
    } catch (error) {
      console.error('❌ Failed to get documents:', error);
      throw error;
    }
  }

  async updateDocument(projectId: string, documentId: string, updates: Partial<DocumentMetadata>): Promise<DocumentMetadata> {
    try {
      const documents = await this.loadDocumentIndex(projectId);
      const docIndex = documents.findIndex(doc => doc.id === documentId);
      
      if (docIndex === -1) {
        throw new Error('Document not found in index');
      }

      const updatedDoc = {
        ...documents[docIndex],
        ...updates,
        updatedAt: new Date().toISOString()
      };

      documents[docIndex] = updatedDoc;
      await this.saveDocumentIndex(projectId, documents);

      console.log(`📝 Updated document metadata: ${documentId}`);
      return updatedDoc;
    } catch (error) {
      console.error('❌ Failed to update document:', error);
      throw error;
    }
  }

  async deleteDocument(projectId: string, documentId: string): Promise<void> {
    try {
      // Delete from Google Drive
      await this.drive.files.delete({ fileId: documentId });

      // Remove from document index
      const documents = await this.loadDocumentIndex(projectId);
      const filteredDocs = documents.filter(doc => doc.id !== documentId);
      await this.saveDocumentIndex(projectId, filteredDocs);

      console.log(`🗑️ Deleted document: ${documentId}`);
    } catch (error) {
      console.error('❌ Failed to delete document:', error);
      throw error;
    }
  }

 async deleteFile(fileId: string): Promise<void> {
    try {
      await this.drive.files.delete({ fileId });
      console.log(`🗑️ Deleted Google Drive file: ${fileId}`);
    } catch (error) {
      console.error(`❌ Failed to delete Google Drive file ${fileId}:`, error);
      throw error;
    }
  }

  // ===========================================
  // JSON FILE OPERATIONS
  // ===========================================

  private async saveProjectMetadata(folderId: string, metadata: ProjectMetadata): Promise<void> {
    const content = JSON.stringify(metadata, null, 2);
    console.log(`💾 Saving project metadata (${content.length} chars):`, content.substring(0, 200) + '...');
    await this.saveJsonFile(folderId, this.PROJECT_METADATA_FILE, content);
  }

  private async loadProjectMetadata(folderId: string): Promise<ProjectMetadata> {
    try {
      const content = await this.loadJsonFile(folderId, this.PROJECT_METADATA_FILE);
      console.log(`📖 Loading project metadata (${content.length} chars):`, content.substring(0, 200) + '...');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to load project metadata: ${error}`);
    }
  }

  private async saveDocumentIndex(folderId: string, documents: DocumentMetadata[]): Promise<void> {
    const content = JSON.stringify(documents, null, 2);
    await this.saveJsonFile(folderId, this.DOCUMENT_INDEX_FILE, content);
  }

  private async loadDocumentIndex(folderId: string): Promise<DocumentMetadata[]> {
    try {
      const content = await this.loadJsonFile(folderId, this.DOCUMENT_INDEX_FILE);
      return JSON.parse(content);
    } catch (error) {
      console.warn('Document index not found, returning empty array');
      return [];
    }
  }

  private async addDocumentToIndex(projectId: string, document: DocumentMetadata): Promise<void> {
    const documents = await this.loadDocumentIndex(projectId);
    documents.push(document);
    await this.saveDocumentIndex(projectId, documents);
  }

  private async saveJsonFile(folderId: string, fileName: string, content: string): Promise<string> {
    try {
      // Check if file already exists
      const existingFiles = await this.drive.files.list({
        q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
        fields: 'files(id)',
      });

      const media = {
        mimeType: 'application/json',
        body: content,
      };

      if (existingFiles.data.files.length > 0) {
        // Update existing file
        const fileId = existingFiles.data.files[0].id;
        await this.drive.files.update({
          fileId,
          media,
        });
        console.log(`📝 Updated JSON file: ${fileName}`);
        return fileId;
      } else {
        // Create new file
        const response = await this.drive.files.create({
          requestBody: {
            name: fileName,
            parents: [folderId],
            mimeType: 'application/json',
          },
          media,
          fields: 'id',
        });
        console.log(`📄 Created JSON file: ${fileName}`);
        return response.data.id;
      }
    } catch (error) {
      console.error(`❌ Failed to save JSON file ${fileName}:`, error);
      throw error;
    }
  }

  private async loadJsonFile(folderId: string, fileName: string): Promise<string> {
    try {
      // Find the file
      const files = await this.drive.files.list({
        q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
        fields: 'files(id)',
      });

      if (files.data.files.length === 0) {
        throw new Error(`File ${fileName} not found in folder ${folderId}`);
      }

      const fileId = files.data.files[0].id;
      
      // Download file content
      const response = await this.drive.files.get({
        fileId,
        alt: 'media',
      });

      console.log(`📖 Loaded JSON file: ${fileName}, content type: ${typeof response.data}`);
      
      // Handle different response formats
      if (typeof response.data === 'string') {
        return response.data;
      } else if (typeof response.data === 'object') {
        return JSON.stringify(response.data);
      } else {
        return String(response.data);
      }
    } catch (error) {
      console.error(`❌ Failed to load JSON file ${fileName}:`, error);
      throw error;
    }
  }

  // ===========================================
  // HELPER METHODS
  // ===========================================

  private async createFolder(name: string, parentId: string): Promise<string> {
    const response = await this.drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      },
      fields: 'id',
    });
    return response.data.id;
  }

  async ensureAppFolder(): Promise<string> {
    try {
      const response = await this.drive.files.list({
        q: `name='${this.APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
      });

      if (response.data.files.length > 0) {
        return response.data.files[0].id;
      }

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

  async deleteFile(fileId: string): Promise<void> {
  try {
    await this.drive.files.delete({ fileId });
    console.log(`🗑️ Deleted Google Drive file: ${fileId}`);
  } catch (error) {
    console.error(`❌ Failed to delete Google Drive file ${fileId}:`, error);
    throw error;
  }
}

  async createProjectFolder(name: string): Promise<{
    rootId: string;
    chaptersId: string;
    charactersId: string;
    researchId: string;
  }> {
    try {
      // Use the existing createProject method
      const { folderId, metadata } = await this.createProject(name, '');
      
      return {
        rootId: folderId,
        chaptersId: metadata.structure?.chaptersId || '',
        charactersId: metadata.structure?.charactersId || '',
        researchId: metadata.structure?.researchId || '',
      };
    } catch (error) {
      console.error('❌ Failed to create project folder structure:', error);
      throw error;
    }
  }
}