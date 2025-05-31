// server/src/routes/auth.ts
import express from 'express';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { google } from 'googleapis';
import User from '../models/User.js';

const router = express.Router();

type Request = ExpressRequest;
type Response = ExpressResponse;

// Generate Google OAuth URL
router.get('/google/url', function(req: Request, res: Response) {

  // Create OAuth2 client inside the handler to ensure env vars are loaded
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  // Define scopes for the OAuth2 client
  const scopes = [
    // User identification (required for login)
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    
    // Google Drive - only create/manage files the app creates
    'https://www.googleapis.com/auth/drive.file',
    
    // Google Docs - only for documents the app creates
    'https://www.googleapis.com/auth/documents'
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
    state: 'security_token',
  });

  console.log('Generated URL:', url); // Debug: see the full URL
  res.json({ url });
});

// Google OAuth callback
router.get('/google/callback', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const code = req.query.code as string;
      const state = req.query.state as string;
      
      if (!code) {
        return res.status(400).json({ error: 'Invalid authorization code' });
      }
      
      if (state !== 'security_token') {
        return res.status(400).json({ error: 'Invalid state parameter' });
      }
      
      // Create OAuth2 client for callback
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );
      
      // Exchange code for tokens
      const { tokens } = await oauth2Client.getToken(code);
      
      if (!tokens.access_token) {
        return res.status(400).json({ error: 'Failed to get access token' });
      }
      
      oauth2Client.setCredentials(tokens);
      
      // Get user info
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const { data } = await oauth2.userinfo.get();
      
      if (!data.id || !data.email) {
        return res.status(400).json({ error: 'Incomplete user data received' });
      }
      
      // Find or create user
      let user = await User.findOne({ googleId: data.id });
      
      if (!user) {
        user = await User.create({
          email: data.email,
          name: data.name || data.email,
          googleId: data.id,
          picture: data.picture,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        });
      } else {
        // Update tokens and user info
        user.accessToken = tokens.access_token;
        if (tokens.refresh_token) {
          user.refreshToken = tokens.refresh_token;
        }
        user.tokenExpiry = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
        user.name = data.name || user.name;
        user.picture = data.picture || user.picture;
        await user.save();
      }
      
      // Test the tokens by making a simple API call
      try {
        const drive = google.drive({ version: 'v3', auth: oauth2Client });
        await drive.about.get({ fields: 'user' });
        console.log('✅ Google Drive API access verified');
      } catch (error) {
        console.error('❌ Google Drive API test failed:', error);
        return res.status(500).json({ error: 'Failed to verify Google API access' });
      }
      
      // Redirect to frontend with user ID
      return res.redirect(`${process.env.FRONTEND_URL}?userId=${user._id}`);
    } catch (error) {
      console.error('OAuth error:', error);
      return res.status(500).json({ error: 'Authentication failed' });
    }
  };
  
  handleRequest();
});

// Test endpoint to verify authentication
router.get('/test', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const userId = req.headers['user-id'] as string;
      
      if (!userId) {
        return res.status(401).json({ error: 'No user ID provided' });
      }
      
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      if (!user.accessToken || !user.refreshToken) {
        return res.status(400).json({ error: 'Missing authentication tokens' });
      }
      
      // Test Google API access
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );
      
      oauth2Client.setCredentials({
        access_token: user.accessToken,
        refresh_token: user.refreshToken,
      });
      
      try {
        const drive = google.drive({ version: 'v3', auth: oauth2Client });
        const aboutResponse = await drive.about.get({ fields: 'user' });
        
        res.json({
          message: 'Authentication successful',
          user: {
            id: user._id,
            email: user.email,
            name: user.name,
            picture: user.picture
          },
          googleUser: aboutResponse.data.user,
          apisAvailable: {
            drive: true,
            docs: true
          }
        });
      } catch (apiError: any) {
        console.error('Google API test error:', apiError);
        
        // If token is expired, try to refresh it
        if (apiError.code === 401) {
          try {
            const { credentials } = await oauth2Client.refreshAccessToken();
            user.accessToken = credentials.access_token;
            if (credentials.refresh_token) {
              user.refreshToken = credentials.refresh_token;
            }
            user.tokenExpiry = credentials.expiry_date ? new Date(credentials.expiry_date) : null;
            await user.save();
            
            return res.json({
              message: 'Authentication refreshed successfully',
              user: {
                id: user._id,
                email: user.email,
                name: user.name,
                picture: user.picture
              }
            });
          } catch (refreshError) {
            console.error('Token refresh failed:', refreshError);
            return res.status(401).json({ error: 'Authentication expired, please login again' });
          }
        }
        
        return res.status(500).json({ error: 'Google API access failed' });
      }
    } catch (error) {
      console.error('Auth test error:', error);
      return res.status(500).json({ error: 'Authentication test failed' });
    }
  };
  
  handleRequest();
});

export default router;