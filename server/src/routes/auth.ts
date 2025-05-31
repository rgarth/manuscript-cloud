import express from 'express';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { google } from 'googleapis';
import User from '../models/User.js';

const router = express.Router();

// Define Request and Response types directly instead of destructuring
type Request = ExpressRequest;
type Response = ExpressResponse;

// Google OAuth2 setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Generate Google OAuth URL
router.get('/google/url', function(req: Request, res: Response) {
  const scopes = [
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/documents'
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
  });

  res.json({ url });
});

// Google OAuth callback
router.get('/google/callback', function(req: Request, res: Response) {
  const handleRequest = async () => {
    try {
      const code = req.query.code as string;
      
      if (!code) {
        return res.status(400).json({ error: 'Invalid authorization code' });
      }
      
      const { tokens } = await oauth2Client.getToken(code);
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
        });
      } else {
        // Update tokens
        user.accessToken = tokens.access_token;
        if (tokens.refresh_token) {
          user.refreshToken = tokens.refresh_token;
        }
        await user.save();
      }
      
      // Create session token (would use JWT in production)
      return res.redirect(`${process.env.FRONTEND_URL}?userId=${user._id}`);
    } catch (error) {
      console.error('OAuth error:', error);
      return res.status(500).json({ error: 'Authentication failed' });
    }
  };
  
  handleRequest();
});

export default router;