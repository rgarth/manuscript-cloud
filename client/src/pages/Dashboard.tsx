// Update client/src/pages/Dashboard.tsx

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { projects } from '../services/api';
import DeleteConfirmationModal from '../components/DeleteConfirmationModal';
import './Dashboard.css';

interface Project {
  _id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  rootFolderId: string;
  owner: string;
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

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = () => {
    setIsLoading(true);
    projects.getAll()
      .then(response => {
        setUserProjects(response.data);
        setIsLoading(false);
      })
      .catch(error => {
        console.error('Failed to load projects:', error);
        setIsLoading(false);
      });
  };

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

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>📚 Manuscript Cloud</h1>
        <p>Organize your writing projects with Google Docs integration</p>
      </header>
      
      <div className="create-project-section">
        <h2>Create New Project</h2>
        <form onSubmit={handleCreateProject} className="create-project-form">
          <input
            type="text"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="Enter project name..."
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
        <h2>My Projects ({userProjects.length})</h2>
        
        {isLoading ? (
          <div className="loading">
            <div className="spinner"></div>
            <p>Loading projects...</p>
          </div>
        ) : (
          <div className="project-list">
            {userProjects.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📝</div>
                <h3>No projects yet</h3>
                <p>Create your first writing project to get started!</p>
              </div>
            ) : (
              userProjects.map(project => (
                <div key={project._id} className="project-card">
                  <div className="project-content">
                    <h3>
                      <Link to={`/projects/${project._id}`} className="project-link">
                        {project.name}
                      </Link>
                    </h3>
                    <p className="project-description">
                      {project.description || 'No description'}
                    </p>
                    <p className="project-date">
                      Created: {new Date(project.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  
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
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
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