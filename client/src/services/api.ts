iimport axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
});

// Add request interceptor to add user ID for authentication
api.interceptors.request.use(config => {
  const userId = localStorage.getItem('userId');
  if (userId) {
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
};

export const documents = {
  getByProject: (projectId: string) => api.get(`/documents/project/${projectId}`),
  create: (data: {
    title: string,
    documentType: string,
    parentId?: string,
    projectId: string,
    synopsis?: string,
  }) => api.post('/documents', data),
  getContent: (id: string) => api.get(`/documents/${id}/content`),
};

export default api;