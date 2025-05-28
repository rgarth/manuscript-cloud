import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projects, documents } from '../services/api';

interface Document {
  _id: string;
  title: string;
  documentType: string;
  parent: string | null;
  googleDocId?: string;
  googleDriveId?: string;
  synopsis?: string;
  order: number;
  metadata: {
    status?: string;
    tags?: string[];
    wordCount?: number;
    customFields?: Record<string, any>;
  };
}

interface ProjectData {
  _id: string;
  name: string;
  description?: string;
  rootFolderId: string;
  createdAt: string;
  updatedAt: string;
}

const Project = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [projectDocs, setProjectDocs] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newDocumentTitle, setNewDocumentTitle] = useState('');
  const [selectedDocType, setSelectedDocType] = useState('text');
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    
    const loadProjectData = async () => {
      setIsLoading(true);
      try {
        // Load project details
        const projectResponse = await projects.getById(id);
        setProject(projectResponse.data as ProjectData);
        
        // Load project documents
        const docsResponse = await documents.getByProject(id);
        setProjectDocs(docsResponse.data);
      } catch (error) {
        console.error('Failed to load project data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadProjectData();
  }, [id]);

  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocumentTitle.trim() || !project) return;
    
    try {
      const response = await documents.create({
        title: newDocumentTitle,
        documentType: selectedDocType,
        parentId: selectedParentId ?? undefined,
        projectId: project._id,
      });
      
      // Add the new document to the list
      setProjectDocs([...projectDocs, response.data]);
      
      // Clear the form
      setNewDocumentTitle('');
    } catch (error) {
      console.error('Failed to create document:', error);
    }
  };

  // Function to organize documents into a tree structure
  const organizeDocuments = () => {
    const rootDocs = projectDocs.filter(doc => doc.parent === null);
    return rootDocs.sort((a, b) => a.order - b.order);
  };

  // Get children of a specific document
  const getChildrenOf = (parentId: string) => {
    return projectDocs
      .filter(doc => doc.parent === parentId)
      .sort((a, b) => a.order - b.order);
  };

  // Recursive component to render document tree
  const DocumentNode = ({ document }: { document: Document }) => {
    const children = getChildrenOf(document._id);
    
    return (
      <div className="document-node">
        <div className={`document-item ${document.documentType}`}>
          <span>{document.title}</span>
          <span className="document-type">{document.documentType}</span>
        </div>
        
        {children.length > 0 && (
          <div className="document-children">
            {children.map(child => (
              <DocumentNode key={child._id} document={child} />
            ))}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return <div>Loading project...</div>;
  }

  if (!project) {
    return <div>Project not found</div>;
  }

  const rootDocuments = organizeDocuments();

  return (
    <div className="project-page">
      <header>
        <h1>{project.name}</h1>
        <p>{project.description}</p>
        <button onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
      </header>

      <div className="project-content">
        <aside className="document-tree">
          <h2>Documents</h2>
          
          <form onSubmit={handleCreateDocument}>
            <input
              type="text"
              value={newDocumentTitle}
              onChange={(e) => setNewDocumentTitle(e.target.value)}
              placeholder="New document title"
            />
            
            <select 
              value={selectedDocType}
              onChange={(e) => setSelectedDocType(e.target.value)}
            >
              <option value="folder">Folder</option>
              <option value="text">Text</option>
              <option value="character">Character</option>
              <option value="setting">Setting</option>
              <option value="note">Note</option>
              <option value="research">Research</option>
            </select>
            
            <select
              value={selectedParentId || ''}
              onChange={(e) => setSelectedParentId(e.target.value || null)}
            >
              <option value="">Root Level</option>
              {projectDocs
                .filter(doc => doc.documentType === 'folder')
                .map(folder => (
                  <option key={folder._id} value={folder._id}>
                    {folder.title}
                  </option>
                ))
              }
            </select>
            
            <button type="submit">Add Document</button>
          </form>
          
          <div className="document-list">
            {rootDocuments.length === 0 ? (
              <p>No documents yet. Create your first document above!</p>
            ) : (
              rootDocuments.map(doc => (
                <DocumentNode key={doc._id} document={doc} />
              ))
            )}
          </div>
        </aside>
        
        <main className="document-content">
          <p>Select a document to view or edit its content</p>
        </main>
      </div>
    </div>
  );
};

export default Project;