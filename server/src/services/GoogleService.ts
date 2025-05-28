import { google } from 'googleapis';

class GoogleService {
  private oauth2Client: any;

  constructor(accessToken: string, refreshToken: string) {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    
    this.oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  }

  // Create a Google Drive folder
  async createFolder(name: string, parentId?: string): Promise<string> {
    const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
    
    const fileMetadata = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    };
    
    const response = await drive.files.create({
      fields: 'id',
      requestBody: fileMetadata,
    });
    
    return response.data.id as string;
  }

  // Create a Google Doc
  async createDocument(name: string, parentId?: string): Promise<{ driveId: string, docId: string }> {
    const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
    
    const fileMetadata = {
      name,
      mimeType: 'application/vnd.google-apps.document',
      parents: parentId ? [parentId] : undefined,
    };
    
    const response = await drive.files.create({
      fields: 'id',
      requestBody: fileMetadata,
    });
    
    return { 
      driveId: response.data.id as string,
      docId: response.data.id as string
    };
  }

  // Get document content
  async getDocumentContent(docId: string): Promise<any> {
    const docs = google.docs({ version: 'v1', auth: this.oauth2Client });
    const response = await docs.documents.get({ documentId: docId });
    return response.data;
  }

  // Update document content
  async updateDocumentContent(docId: string, content: string): Promise<void> {
    const docs = google.docs({ version: 'v1', auth: this.oauth2Client });
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: [
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
  }
}

export default GoogleService;