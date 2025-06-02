import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
});

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
  update: (id: string, data: any) => api.patch(`/projects/${id}`, data),
  delete: (id: string) => api.delete(`/projects/${id}`),
  export: (id: string) => api.get(`/projects/${id}/export`),
};

export const documents = {
  getByProject: (projectId: string) => api.get(`/documents/project/${projectId}`),
  create: (data: {
    title: string,
    documentType: string,
    parentId?: string,
    projectId: string,
    content?: string,
  }) => api.post('/documents', data),
  update: (id: string, data: any) => api.patch(`/documents/${id}`, data),
  move: (id: string, data: { newParentId?: string }) => api.patch(`/documents/${id}/move`, data),
  delete: (id: string, force: boolean = false) => api.delete(`/documents/${id}${force ? '?force=true' : ''}`),
};

export default api;