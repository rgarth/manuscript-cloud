// client/src/services/api.ts - UPDATED WITH ORDER SUPPORT

import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
});

// Add request interceptor to add user ID for authentication
api.interceptors.request.use(config => {
  const userId = localStorage.getItem('userId');
  if (userId) {
    if (!config.headers) {
        config.headers = axios.AxiosHeaders.from({});
      }
    config.headers['user-id'] = userId;
  }
  return config;
});

export const auth = {
  getGoogleAuthUrl: () => api.get('/auth/google/url'),
};

export const projects = {
  getAll: () => api.get('/projects'),
  create: (data: { name: string, description?: string }) => api.post('/projects', data),
  getById: (id: string) => api.get(`/projects/${id}`),
  sync: (id: string, fullSync: boolean = false) => api.post(`/projects/${id}/sync`, { fullSync }),
  delete: (id: string) => api.delete(`/projects/${id}`),
};

export const documents = {
  getByProject: (projectId: string) => api.get(`/documents/project/${projectId}`),
  create: (data: {
    title: string,
    documentType: string,
    parentId?: string,
    projectId: string,
    synopsis?: string,
    order?: number, // NEW: Support for custom order
  }) => api.post('/documents', data),
  getContent: (id: string) => api.get(`/documents/${id}/content`),
  update: (id: string, data: {
    title?: string,
    synopsis?: string,
    metadata?: any,
  }) => api.patch(`/documents/${id}`, data),
  // ENHANCED: Move method with order support
  move: (id: string, data: {
    newParentId?: string,
    newOrder?: number, // NEW: Support for reordering
  }) => api.patch(`/documents/${id}/move`, data),
  canDelete: (id: string) => api.get(`/documents/${id}/can-delete`),
  delete: (id: string, force: boolean = false) => api.delete(`/documents/${id}${force ? '?force=true' : ''}`),
};

export default api;