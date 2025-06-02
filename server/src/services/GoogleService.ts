// server/src/services/GoogleService.ts - FIXED DOCUMENT CREATION
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
    notesId: string;
    charactersId: string;
    researchId: string;
    placesId: string;
    miscId: string;
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
  // FIXED DOCUMENT CREATION - HANDLES PARENT CORRECTLY
  // ===========================================

  async createDocument(
    projectId: string,
    title: string, 
    parentId: string, 
    documentType: string = 'scene'
  ): Promise<{ driveId: string; metadata: DocumentMetadata }> {
    try {
      console.log(`📝 Creating ${documentType} "${title}" in parent: ${parentId}`);
      
      let driveId: string;
      let actualParentId = parentId;

      // Create the actual file/folder in Google Drive
      if (documentType === 'folder' || documentType === 'chapter' || documentType === 'part') {
        // Create as folder
        driveId = await this.createFolder(title, actualParentId);
        console.log(`📁 Created folder "${title}" with ID: ${driveId} in parent: ${actualParentId}`);
      } else {
        // Create as Google Doc
        const response = await this.drive.files.create({
          requestBody: {
            name: title,
            mimeType: 'application/vnd.google-apps.document',
            parents: [actualParentId],
          },
          fields: 'id',
        });
        driveId = response.data.id;
        console.log(`📄 Created document "${title}" with ID: ${driveId} in parent: ${actualParentId}`);
      }

      // Create metadata entry for JSON index
      const metadata: DocumentMetadata = {
        id: driveId,
        title,
        documentType,
        parentId: actualParentId === projectId ? undefined : actualParentId,
        order: Date.now(), // Use timestamp for ordering
        status: 'draft',
        includeInCompile: this.shouldIncludeInCompile(documentType),
        wordCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: [],
      };

      // Add to document index
      await this.addDocumentToIndex(projectId, metadata);

      console.log(`✅ Created ${documentType} "${title}" with proper parent structure`);
      return { driveId, metadata };
    } catch (error) {
      console.error('❌ Failed to create document:', error);
      throw error;
    }
  }

  // ===========================================
  // PROJECT CREATION WITH PROPER STRUCTURE
  // ===========================================

  async createProject(name: string, description: string = ''): Promise<{
    folderId: string;
    metadata: ProjectMetadata;
  }> {
    try {
      const appFolderId = await this.ensureAppFolder();

      // Create project root folder inside app folder
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

      // Create main organizational folders
      const chaptersFolder = await this.createFolder('Chapters', projectId);
      const notesFolder = await this.createFolder('Notes', projectId);

      // Create Notes subfolders
      const [charactersFolder, researchFolder, placesFolder, miscFolder] = await Promise.all([
        this.createFolder('Characters', notesFolder),
        this.createFolder('Research', notesFolder),
        this.createFolder('Places', notesFolder),
        this.createFolder('Misc', notesFolder),
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
          notesId: notesFolder,
          charactersId: charactersFolder,
          researchId: researchFolder,
          placesId: placesFolder,
          miscId: miscFolder,
        },
        statistics: {
          totalWords: 0,
          documentCount: 0,
          lastUpdated: new Date().toISOString()
        }
      };

      // Save metadata to JSON file
      await this.saveProjectMetadata(projectId, metadata);

      // Initialize document index with structure folders
      const initialDocuments: DocumentMetadata[] = [
        {
          id: chaptersFolder,
          title: 'Chapters',
          documentType: 'folder',
          order: 0,
          status: 'draft',
          includeInCompile: false,
          wordCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: []
        },
        {
          id: notesFolder,
          title: 'Notes',
          documentType: 'folder',
          order: 1,
          status: 'draft',
          includeInCompile: false,
          wordCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: []
        },
        {
          id: charactersFolder,
          title: 'Characters',
          documentType: 'folder',
          parentId: notesFolder,
          order: 0,
          status: 'draft',
          includeInCompile: false,
          wordCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: []
        },
        {
          id: researchFolder,
          title: 'Research',
          documentType: 'folder',
          parentId: notesFolder,
          order: 1,
          status: 'draft',
          includeInCompile: false,
          wordCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: []
        },
        {
          id: placesFolder,
          title: 'Places',
          documentType: 'folder',
          parentId: notesFolder,
          order: 2,
          status: 'draft',
          includeInCompile: false,
          wordCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: []
        },
        {
          id: miscFolder,
          title: 'Misc',
          documentType: 'folder',
          parentId: notesFolder,
          order: 3,
          status: 'draft',
          includeInCompile: false,
          wordCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: []
        }
      ];

      await this.saveDocumentIndex(projectId, initialDocuments);

      console.log(`📁 Created project "${name}" with proper folder structure`);
      return { folderId: projectId, metadata };
    } catch (error) {
      console.error('❌ Failed to create project:', error);
      throw error;
    }
  }

  // ===========================================
  // HELPER METHODS
  // ===========================================

  private shouldIncludeInCompile(documentType: string): boolean {
    return documentType === 'scene';
  }

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
        console.log(`📁 Found existing app folder: ${this.APP_FOLDER_NAME}`);
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

  // ===========================================
  // PROJECT MANAGEMENT METHODS
  // ===========================================

  async getProject(folderId: string): Promise<ProjectMetadata> {
    try {
      return await this.loadProjectMetadata(folderId);
    } catch (error) {
      console.warn(`⚠️ Project metadata missing for ${folderId}, attempting repair...`);
      return await this.repairProjectMetadata(folderId);
    }
  }

  async getDocuments(projectId: string): Promise<DocumentMetadata[]> {
    try {
      return await this.loadDocumentIndex(projectId);
    } catch (error) {
      console.warn(`⚠️ Document index missing for ${projectId}, attempting repair...`);
      return await this.repairDocumentIndex(projectId);
    }
  }

  async updateProject(folderId: string, updates: Partial<ProjectMetadata>): Promise<ProjectMetadata> {
    try {
      const currentMetadata = await this.getProject(folderId);
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

  async updateDocument(projectId: string, documentId: string, updates: Partial<DocumentMetadata>): Promise<DocumentMetadata> {
    try {
      const documents = await this.getDocuments(projectId);
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
      const documents = await this.getDocuments(projectId);
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
  // AUTO-REPAIR FUNCTIONALITY
  // ===========================================

  private async repairProjectMetadata(folderId: string): Promise<ProjectMetadata> {
    try {
      console.log(`🔧 Repairing project metadata for folder: ${folderId}`);
      
      // Get folder info to extract project name
      const folderInfo = await this.drive.files.get({
        fileId: folderId,
        fields: 'name, description, createdTime'
      });

      // Discover or create proper folder structure
      const structure = await this.ensureProjectStructure(folderId);

      // Create default metadata with proper structure
      const metadata: ProjectMetadata = {
        name: folderInfo.data.name || 'Recovered Project',
        description: folderInfo.data.description || 'Project recovered from Google Drive',
        createdBy: this.userEmail,
        createdAt: folderInfo.data.createdTime || new Date().toISOString(),
        version: '1.0',
        settings: {
          compileSettings: { includeComments: false },
          exportFormats: ['docx'],
          wordCountGoals: { daily: 500, total: 80000 }
        },
        collaborators: [],
        structure,
        statistics: {
          totalWords: 0,
          documentCount: 0,
          lastUpdated: new Date().toISOString()
        }
      };

      // Save repaired metadata
      await this.saveProjectMetadata(folderId, metadata);
      
      console.log(`✅ Repaired project metadata with proper structure for: ${metadata.name}`);
      return metadata;
    } catch (error) {
      console.error('❌ Failed to repair project metadata:', error);
      throw new Error(`Could not repair project metadata: ${error}`);
    }
  }

  private async repairDocumentIndex(projectId: string): Promise<DocumentMetadata[]> {
    try {
      console.log(`🔧 Repairing document index for project: ${projectId}`);
      
      // Get project structure
      const projectMetadata = await this.getProject(projectId);
      const structure = projectMetadata.structure;
      
      // Create initial structure documents
      const structureDocuments: DocumentMetadata[] = [];
      
      if (structure) {
        const now = new Date().toISOString();
        
        // Add main folders
        structureDocuments.push({
          id: structure.chaptersId,
          title: 'Chapters',
          documentType: 'folder',
          order: 0,
          status: 'draft',
          includeInCompile: false,
          wordCount: 0,
          createdAt: now,
          updatedAt: now,
          tags: []
        });
        
        structureDocuments.push({
          id: structure.notesId,
          title: 'Notes',
          documentType: 'folder',
          order: 1,
          status: 'draft',
          includeInCompile: false,
          wordCount: 0,
          createdAt: now,
          updatedAt: now,
          tags: []
        });
        
        // Add Notes subfolders
        structureDocuments.push({
          id: structure.charactersId,
          title: 'Characters',
          documentType: 'folder',
          parentId: structure.notesId,
          order: 0,
          status: 'draft',
          includeInCompile: false,
          wordCount: 0,
          createdAt: now,
          updatedAt: now,
          tags: []
        });
        
        structureDocuments.push({
          id: structure.researchId,
          title: 'Research',
          documentType: 'folder',
          parentId: structure.notesId,
          order: 1,
          status: 'draft',
          includeInCompile: false,
          wordCount: 0,
          createdAt: now,
          updatedAt: now,
          tags: []
        });
        
        structureDocuments.push({
          id: structure.placesId,
          title: 'Places',
          documentType: 'folder',
          parentId: structure.notesId,
          order: 2,
          status: 'draft',
          includeInCompile: false,
          wordCount: 0,
          createdAt: now,
          updatedAt: now,
          tags: []
        });
        
        structureDocuments.push({
          id: structure.miscId,
          title: 'Misc',
          documentType: 'folder',
          parentId: structure.notesId,
          order: 3,
          status: 'draft',
          includeInCompile: false,
          wordCount: 0,
          createdAt: now,
          updatedAt: now,
          tags: []
        });
      }
      
      // Scan for any additional documents that might exist
      const scannedDocuments = await this.scanProjectForDocuments(projectId);
      
      // Merge structure documents with scanned documents (avoiding duplicates)
      const allDocuments = [...structureDocuments];
      for (const scannedDoc of scannedDocuments) {
        if (!allDocuments.some(doc => doc.id === scannedDoc.id)) {
          allDocuments.push(scannedDoc);
        }
      }
      
      // Save repaired index
      await this.saveDocumentIndex(projectId, allDocuments);
      
      console.log(`✅ Repaired document index with ${allDocuments.length} documents`);
      return allDocuments;
    } catch (error) {
      console.error('❌ Failed to repair document index:', error);
      // Return minimal structure as fallback
      const now = new Date().toISOString();
      const fallbackDocs: DocumentMetadata[] = [
        {
          id: 'chapters-fallback',
          title: 'Chapters',
          documentType: 'folder',
          order: 0,
          status: 'draft',
          includeInCompile: false,
          wordCount: 0,
          createdAt: now,
          updatedAt: now,
          tags: []
        }
      ];
      await this.saveDocumentIndex(projectId, fallbackDocs);
      return fallbackDocs;
    }
  }

  private async ensureProjectStructure(folderId: string): Promise<{
    chaptersId: string;
    notesId: string;
    charactersId: string;
    researchId: string;
    placesId: string;
    miscId: string;
  }> {
    try {
      // Look for existing structure folders
      const subfolders = await this.drive.files.list({
        q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
      });

      const folders = subfolders.data.files || [];
      
      // Find or create main folders
      let chaptersId = folders.find((f: any) => f.name?.toLowerCase() === 'chapters')?.id;
      let notesId = folders.find((f: any) => f.name?.toLowerCase() === 'notes')?.id;

      if (!chaptersId) {
        chaptersId = await this.createFolder('Chapters', folderId);
      }
      if (!notesId) {
        notesId = await this.createFolder('Notes', folderId);
      }

      // Ensure Notes subfolders exist
      const notesSubfolders = await this.drive.files.list({
        q: `'${notesId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
      });

      const notesSubfoldersList = notesSubfolders.data.files || [];
      
      let charactersId = notesSubfoldersList.find((f: any) => f.name?.toLowerCase() === 'characters')?.id;
      let researchId = notesSubfoldersList.find((f: any) => f.name?.toLowerCase() === 'research')?.id;
      let placesId = notesSubfoldersList.find((f: any) => f.name?.toLowerCase() === 'places')?.id;
      let miscId = notesSubfoldersList.find((f: any) => f.name?.toLowerCase() === 'misc')?.id;

      // Create missing Notes subfolders
      if (!charactersId) {
        charactersId = await this.createFolder('Characters', notesId);
      }
      if (!researchId) {
        researchId = await this.createFolder('Research', notesId);
      }
      if (!placesId) {
        placesId = await this.createFolder('Places', notesId);
      }
      if (!miscId) {
        miscId = await this.createFolder('Misc', notesId);
      }

      return { chaptersId, notesId, charactersId, researchId, placesId, miscId };
    } catch (error) {
      console.error('❌ Failed to ensure project structure:', error);
      throw error;
    }
  }

  private async scanProjectForDocuments(projectId: string): Promise<DocumentMetadata[]> {
    try {
      // Get all files in the project folder and subfolders
      const allFiles = await this.getAllFilesInProject(projectId);
      
      const documents: DocumentMetadata[] = [];
      let order = 100; // Start high to avoid conflicts with structure folders

      for (const file of allFiles) {
        if (file.mimeType === 'application/vnd.google-apps.document') {
          // It's a Google Doc
          documents.push({
            id: file.id,
            title: file.name || 'Untitled Document',
            documentType: this.guessDocumentType(file.name || '', file.parents?.[0]),
            parentId: file.parents?.[0] === projectId ? undefined : file.parents?.[0],
            order: order++,
            status: 'draft',
            includeInCompile: this.shouldIncludeInCompile(this.guessDocumentType(file.name || '', file.parents?.[0])),
            wordCount: 0,
            createdAt: file.createdTime || new Date().toISOString(),
            updatedAt: file.modifiedTime || new Date().toISOString(),
            tags: [],
          });
        } else if (file.mimeType === 'application/vnd.google-apps.folder' && file.id !== projectId) {
          // It's a subfolder (but skip if it's already in structure)
          documents.push({
            id: file.id,
            title: file.name || 'Untitled Folder',
            documentType: this.guessFolderType(file.name || ''),
            parentId: file.parents?.[0] === projectId ? undefined : file.parents?.[0],
            order: order++,
            status: 'draft',
            includeInCompile: false,
            wordCount: 0,
            createdAt: file.createdTime || new Date().toISOString(),
            updatedAt: file.modifiedTime || new Date().toISOString(),
            tags: [],
          });
        }
      }

      return documents;
    } catch (error) {
      console.error('❌ Failed to scan project for documents:', error);
      return [];
    }
  }

  private async getAllFilesInProject(projectId: string): Promise<any[]> {
    const allFiles: any[] = [];
    let pageToken: string | undefined = undefined;

    do {
      const response: any = await this.drive.files.list({
        q: `'${projectId}' in parents and trashed=false`,
        fields: 'files(id, name, mimeType, parents, createdTime, modifiedTime), nextPageToken',
        pageToken,
      });

      if (response.data.files) {
        allFiles.push(...response.data.files);
      }

      pageToken = response.data.nextPageToken;
    } while (pageToken);

    // Recursively get files from subfolders
    const subfolders = allFiles.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
    for (const folder of subfolders) {
      const subFiles = await this.getAllFilesInProject(folder.id);
      allFiles.push(...subFiles);
    }

    return allFiles;
  }

  private guessDocumentType(fileName: string, parentId?: string): string {
    const name = fileName.toLowerCase();
    
    if (name.includes('character')) return 'character';
    if (name.includes('setting') || name.includes('location') || name.includes('place')) return 'setting';
    if (name.includes('research') || name.includes('note')) return 'research';
    if (name.includes('chapter')) return 'scene'; // Documents in chapter folders are scenes
    
    // Default to scene for documents
    return 'scene';
  }

  private guessFolderType(folderName: string): string {
    const name = folderName.toLowerCase();
    
    if (name.includes('chapter')) return 'chapter';
    if (name.includes('part')) return 'part';
    
    // Default to folder
    return 'folder';
  }

  // ===========================================
  // JSON FILE OPERATIONS
  // ===========================================

  private async loadProjectMetadata(folderId: string): Promise<ProjectMetadata> {
    try {
      const content = await this.loadJsonFile(folderId, this.PROJECT_METADATA_FILE);
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Project metadata not found: ${error}`);
    }
  }

  private async loadDocumentIndex(folderId: string): Promise<DocumentMetadata[]> {
    try {
      const content = await this.loadJsonFile(folderId, this.DOCUMENT_INDEX_FILE);
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Document index not found: ${error}`);
    }
  }

  private async saveProjectMetadata(folderId: string, metadata: ProjectMetadata): Promise<void> {
    const content = JSON.stringify(metadata, null, 2);
    await this.saveJsonFile(folderId, this.PROJECT_METADATA_FILE, content);
  }

  private async saveDocumentIndex(folderId: string, documents: DocumentMetadata[]): Promise<void> {
    const content = JSON.stringify(documents, null, 2);
    await this.saveJsonFile(folderId, this.DOCUMENT_INDEX_FILE, content);
  }

  private async addDocumentToIndex(projectId: string, document: DocumentMetadata): Promise<void> {
    const documents = await this.getDocuments(projectId);
    documents.push(document);
    await this.saveDocumentIndex(projectId, documents);
  }

  private async saveJsonFile(folderId: string, fileName: string, content: string): Promise<string> {
    try {
      const existingFiles = await this.drive.files.list({
        q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
        fields: 'files(id)',
      });

      const media = {
        mimeType: 'application/json',
        body: content,
      };

      if (existingFiles.data.files.length > 0) {
        const fileId = existingFiles.data.files[0].id;
        await this.drive.files.update({
          fileId,
          media,
        });
        console.log(`📝 Updated JSON file: ${fileName} in folder ${folderId}`);
        return fileId;
      } else {
        const response = await this.drive.files.create({
          requestBody: {
            name: fileName,
            parents: [folderId],
            mimeType: 'application/json',
          },
          media,
          fields: 'id',
        });
        console.log(`📄 Created JSON file: ${fileName} in folder ${folderId}`);
        return response.data.id;
      }
    } catch (error) {
      console.error(`❌ Failed to save JSON file ${fileName} in folder ${folderId}:`, error);
      throw error;
    }
  }

  private async loadJsonFile(folderId: string, fileName: string): Promise<string> {
    try {
      const files = await this.drive.files.list({
        q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
        fields: 'files(id)',
      });

      if (files.data.files.length === 0) {
        throw new Error(`File ${fileName} not found in folder ${folderId}`);
      }

      const fileId = files.data.files[0].id;
      
      const response = await this.drive.files.get({
        fileId,
        alt: 'media',
      });

      if (typeof response.data === 'string') {
        return response.data;
      } else if (typeof response.data === 'object') {
        return JSON.stringify(response.data);
      } else {
        return String(response.data);
      }
    } catch (error) {
      throw new Error(`Failed to load ${fileName} from folder ${folderId}: ${error}`);
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
}