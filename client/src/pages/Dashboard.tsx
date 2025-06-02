// Update client/src/pages/Dashboard.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { projects, documents } from '../services/api';
import DeleteConfirmationModal from '../components/DeleteConfirmationModal';
import './Dashboard.css';

interface Project {
  _id: string;
  name: string;
  description?: string;
  author?: string;
  synopsis?: string;
  createdAt: string;
  updatedAt: string;
  rootFolderId: string;
  owner: string;
  wordCount?: number;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [userProjects, setUserProjects] = useState<Project[]>([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  
  // Delete modal state
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    project: Project | null;
    isDeleting: boolean;
  }>({
    isOpen: false,
    project: null,
    isDeleting: false
  });

  const getProjectWordCount = async (projectId: string): Promise<number> => {
    try {
      const response = await documents.getByProject(projectId);
      const docs = response.data;
      
      // Find the Manuscript folder
      const manuscriptFolder = docs.find((doc: any) => 
        doc.title === 'Manuscript' && doc.documentType === 'folder'
      );
      
      if (!manuscriptFolder) return 0;
      
      // Use stored word counts instead of parsing content
      const getWordCountRecursive = (parentId: string): number => {
        let totalWords = 0;
        const children = docs.filter((doc: any) => doc.parent === parentId);
        
        children.forEach((child: any) => {
          // Use stored wordCount if available, otherwise add 0
          totalWords += child.metadata?.wordCount || 0;
          
          // Recursively count words in subfolders
          if (child.documentType === 'folder' || child.documentType === 'chapter') {
            totalWords += getWordCountRecursive(child._id);
          }
        });
        
        return totalWords;
      };
      
      return getWordCountRecursive(manuscriptFolder._id);
    } catch (error) {
      console.error('Failed to get word count:', error);
      return 0;
    }
  };

  const loadProjects = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await projects.getAll();
      const projectsData = response.data;
      
      // Get word counts for each project
      const projectsWithWordCount = await Promise.all(
        projectsData.map(async (project: Project) => {
          const wordCount = await getProjectWordCount(project._id);
          return { ...project, wordCount };
        })
      );
      
      setUserProjects(projectsWithWordCount);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleCreateProject = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newProjectName.trim() || isCreating) return;

    setIsCreating(true);
    projects.create({ name: newProjectName })
      .then((response) => {
        setNewProjectName('');
        // Navigate to the newly created project immediately
        navigate(`/projects/${response.data._id}`);
      })
      .catch(error => {
        console.error('Failed to create project:', error);
        // You might want to show an error message to the user here
      })
      .finally(() => {
        setIsCreating(false);
      });
  };

  const handleDeleteClick = (project: Project, e: React.MouseEvent) => {
    e.preventDefault(); // Prevent navigation
    e.stopPropagation();
    setDeleteModal({
      isOpen: true,
      project,
      isDeleting: false
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModal.project) return;

    setDeleteModal(prev => ({ ...prev, isDeleting: true }));

    try {
      await projects.delete(deleteModal.project._id);
      
      // Remove the project from the local state
      setUserProjects(prev => 
        prev.filter(p => p._id !== deleteModal.project!._id)
      );
      
      // Close modal
      setDeleteModal({
        isOpen: false,
        project: null,
        isDeleting: false
      });
      
      console.log('Project deleted successfully');
    } catch (error) {
      console.error('Failed to delete project:', error);
      setDeleteModal(prev => ({ ...prev, isDeleting: false }));
      // You might want to show an error message to the user here
    }
  };

  const handleDeleteCancel = () => {
    setDeleteModal({
      isOpen: false,
      project: null,
      isDeleting: false
    });
  };

  const formatWordCount = (count: number): string => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}k`;
    }
    return count.toString();
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-content">
          <div className="header-text">
            <h1>Manuscript Cloud</h1>
            <p>Organize your writing projects</p>
          </div>
          <div className="header-stats">
            <div className="stat">
              <span className="stat-number">{userProjects.length}</span>
              <span className="stat-label">Projects</span>
            </div>
            <div className="stat">
              <span className="stat-number">
                {formatWordCount(userProjects.reduce((total, p) => total + (p.wordCount || 0), 0))}
              </span>
              <span className="stat-label">Total Words</span>
            </div>
          </div>
        </div>
      </header>
      
      <div className="dashboard-content">
        <div className="create-project-section">
          <form onSubmit={handleCreateProject} className="create-project-form">
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Enter project title..."
              className="project-input"
              disabled={isCreating}
            />
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={isCreating || !newProjectName.trim()}
            >
              {isCreating ? (
                <>
                  <span className="spinner"></span>
                  Creating...
                </>
              ) : (
                <>
                  ✨ Create Project
                </>
              )}
            </button>
          </form>
        </div>
        
        <div className="projects-section">
          {isLoading ? (
            <div className="loading">
              <div className="spinner"></div>
              <p>Loading projects...</p>
            </div>
          ) : (
            <div className="project-grid">
              {userProjects.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📝</div>
                  <h3>No projects yet</h3>
                  <p>Create your first writing project to get started!</p>
                </div>
              ) : (
                userProjects.map(project => (
                  <div key={project._id} className="project-card">
                    <div className="project-main">
                      <div className="project-header">
                        <h3 className="project-title">{project.name}</h3>
                        <div className="project-actions">
                          <Link 
                            to={`/projects/${project._id}`} 
                            className="btn btn-primary btn-sm"
                          >
                            📖 Open
                          </Link>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={(e) => handleDeleteClick(project, e)}
                            title="Delete project"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                      
                      <div className="project-info">
                        <div className="project-field">
                          <span className="field-label">Author:</span>
                          <span className="field-value">{project.author || 'Not set'}</span>
                        </div>
                        
                        <div className="project-field">
                          <span className="field-label">Synopsis:</span>
                          <span className="field-value">
                            {project.synopsis || 'No synopsis yet'}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="project-stats">
                      <div className="stat-item">
                        <span className="stat-number">{formatWordCount(project.wordCount || 0)}</span>
                        <span className="stat-label">words</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-number">{new Date(project.createdAt).toLocaleDateString()}</span>
                        <span className="stat-label">created</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-number">{new Date(project.updatedAt).toLocaleDateString()}</span>
                        <span className="stat-label">updated</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <DeleteConfirmationModal
        isOpen={deleteModal.isOpen}
        title="Delete Project"
        itemName={deleteModal.project?.name || ''}
        itemType="project"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        isDeleting={deleteModal.isDeleting}
      />
    </div>
  );
};

export default Dashboard;