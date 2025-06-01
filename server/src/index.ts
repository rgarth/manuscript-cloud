// server/src/index.ts - UPDATE YOUR EXISTING FILE
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Import routes
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import documentRoutes from './routes/documents.js';
import testMetadataRoutes from './routes/test-metadata.js'; // ADD THIS LINE

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Register routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/test', testMetadataRoutes); // ADD THIS LINE

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Manuscript Cloud API is running' });
});

// Start server
const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`🧪 Test metadata endpoints available at:`);
  console.log(`   POST /api/test/create-project`);
  console.log(`   GET  /api/test/project/:folderId`);
  console.log(`   POST /api/test/project/:folderId/document`);
  console.log(`   GET  /api/test/document/:docId`);
  console.log(`   GET  /api/test/project/:folderId/structure`);
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost/manuscript-cloud')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));