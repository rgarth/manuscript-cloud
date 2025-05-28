import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { projects } from '../services/api';

const Dashboard = () => {
  const [userProjects, setUserProjects] = useState([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [isLoading, setIsLoading] = useState(true);

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

  const handleCreateProject = (e) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    projects.create({ name: newProjectName })
      .then(() => {
        setNewProjectName('');
        loadProjects();
      })
      .catch(error => {
        console.error('Failed to create project:', error);
      });
  };

  return (
    <div className="dashboard">
      <h1>My Projects</h1>
      
      <form onSubmit={handleCreateProject}>
        <input
          type="text"
          value={newProjectName}
          onChange={(e) => setNewProjectName(e.target.value)}
          placeholder="New project name"
        />
        <button type="submit">Create Project</button>
      </form>
      
      {isLoading ? (
        <p>Loading projects...</p>
      ) : (
        <div className="project-list">
          {userProjects.length === 0 ? (
            <p>No projects yet. Create your first project above!</p>
          ) : (
            userProjects.map(project => (
              <div key={project._id} className="project-card">
                <h3>
                  <Link to={`/projects/${project._id}`}>{project.name}</Link>
                </h3>
                <p>{project.description || 'No description'}</p>
                <p>Created: {new Date(project.createdAt).toLocaleDateString()}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default Dashboard;