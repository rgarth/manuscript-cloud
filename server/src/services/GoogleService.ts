// server/src/services/GoogleService.ts
import { google } from 'googleapis';
import User from '../models/User.js';

class GoogleService {
  private oauth2Client: any;
  private drive: any;
  private docs: any;
  private userId: string;

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

  // Create a Google Drive folder
  async createFolder(name: string, parentId?: string): Promise<string> {
    try {
      const fileMetadata = {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : undefined,
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

  // Create a Google Doc
  async createDocument(name: string, parentId?: string): Promise<{ driveId: string, docId: string }> {
    try {
      const fileMetadata = {
        name,
        mimeType: 'application/vnd.google-apps.document',
        parents: parentId ? [parentId] : undefined,
      };
      
      const response = await this.drive.files.create({
        requestBody: fileMetadata,
        fields: 'id',
      });
      
      console.log(`📄 Created document "${name}" with ID: ${response.data.id}`);
      
      return { 
        driveId: response.data.id as string,
        docId: response.data.id as string
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

  // Update document content
  async updateDocumentContent(docId: string, content: string): Promise<void> {
    try {
      // First, clear the document
      const doc = await this.docs.documents.get({ documentId: docId });
      const docLength = doc.data.body?.content?.reduce((length: number, element: any) => {
        if (element.paragraph) {
          return length + (element.paragraph.elements?.reduce((pLength: number, pElement: any) => {
            return pLength + (pElement.textRun?.content?.length || 0);
          }, 0) || 0);
        }
        return length;
      }, 0) || 1;

      await this.docs.documents.batchUpdate({
        documentId: docId,
        requestBody: {
          requests: [
            {
              deleteContentRange: {
                range: {
                  startIndex: 1,
                  endIndex: docLength,
                },
              },
            },
            {
              insertText: {
                location: {
                  index: 1,
                },
                text: content,
              },
            },
          ],
        },
      });
      
      console.log(`✏️ Updated content for document: ${docId}`);
    } catch (error) {
      console.error('❌ Failed to update document content:', error);
      throw new Error(`Failed to update document content: ${error}`);
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

  // List files in a folder
  async listFiles(folderId?: string): Promise<any[]> {
    try {
      const query = folderId ? `'${folderId}' in parents and trashed=false` : 'trashed=false';
      
      const response = await this.drive.files.list({
        q: query,
        fields: 'files(id, name, mimeType, createdTime, modifiedTime)',
        orderBy: 'name',
      });
      
      return response.data.files || [];
    } catch (error) {
      console.error('❌ Failed to list files:', error);
      throw new Error(`Failed to list files: ${error}`);
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