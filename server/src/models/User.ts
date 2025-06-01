import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
  },
  googleId: {
    type: String,
    required: true,
    unique: true,
  },
  picture: String,
  accessToken: String,
  refreshToken: String,
  tokenExpiry: Date,
}, { timestamps: true });

export default mongoose.model('User', UserSchema);