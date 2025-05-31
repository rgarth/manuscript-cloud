// client/src/pages/Project.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projects, documents } from '../services/api';
import './Project.css';

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
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [newDocumentTitle, setNewDocumentTitle] = useState('');
  const [selectedDocType, setSelectedDocType] = useState('scene');
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Document types - folders vs actual docs
  const documentTypes = [
    // Organizational folders
    { value: 'book', label: '📚 Book', description: 'Top-level book container', isFolder: true },
    { value: 'part', label: '📑 Part', description: 'Optional book section', isFolder: true },
    { value: 'chapter', label: '📖 Chapter', description: 'Chapter folder (contains scenes)', isFolder: true },
    
    // Actual documents
    { value: 'scene', label: '🎬 Scene', description: 'Individual scene document', isFolder: false },
    { value: 'character', label: '👤 Character', description: 'Character notes', isFolder: false },
    { value: 'place', label: '🏛️ Place', description: 'Location/setting notes', isFolder: false },
    { value: 'note', label: '📝 Note', description: 'General notes', isFolder: false },
    { value: 'research', label: '📚 Research', description: 'Research materials', isFolder: false }
  ];

  useEffect(() => {
    if (!id) return;
    loadProjectData();
  }, [id]);

  const loadProjectData = async () => {
    setIsLoading(true);
    try {
      const [projectResponse, docsResponse] = await Promise.all([
        projects.getById(id!),
        documents.getByProject(id!)
      ]);
      
      setProject(projectResponse.data as ProjectData);
      setProjectDocs(docsResponse.data as Document[]);
    } catch (error) {
      console.error('Failed to load project data:', error);
    } finally {
      setIsLoading(false);
    }
  };

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
      
      setProjectDocs([...projectDocs, response.data as Document]);
      setNewDocumentTitle('');
    } catch (error) {
      console.error('Failed to create document:', error);
      alert('Failed to create document. Please try again.');
    }
  };

  const handleSync = async (fullSync: boolean = false) => {
    if (!project || isSyncing) return;
    
    setIsSyncing(true);
    try {
      await projects.sync(project._id, fullSync);
      // Reload project data after sync
      await loadProjectData();
      alert('Project synced successfully!');
    } catch (error) {
      console.error('Failed to sync project:', error);
      alert('Failed to sync project. Please try again.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Organize documents into tree structure
  const buildDocumentTree = () => {
    const rootDocs = projectDocs.filter(doc => doc.parent === null);
    return rootDocs.sort((a, b) => a.order - b.order);
  };

  const getChildrenOf = (parentId: string): Document[] => {
    return projectDocs
      .filter(doc => doc.parent === parentId)
      .sort((a, b) => a.order - b.order);
  };

  // Recursive component for document tree
  const DocumentTreeNode: React.FC<{ 
    document: Document; 
    level: number;
    onSelect: (docId: string) => void;
    selectedId: string | null;
  }> = ({ document, level, onSelect, selectedId }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const children = getChildrenOf(document._id);
    const hasChildren = children.length > 0;
    const isSelected = selectedId === document._id;

    const getDocumentIcon = (type: string) => {
      const typeInfo = documentTypes.find(t => t.value === type);
      return typeInfo?.label.split(' ')[0] || '📄';
    };

    return (
      <div className="document-tree-node">
        <div 
          className={`document-item ${document.documentType} ${isSelected ? 'selected' : ''}`}
          style={{ paddingLeft: `${level * 20}px` }}
          onClick={() => onSelect(document._id)}
        >
          {hasChildren && (
            <button 
              className="expand-button"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          )}
          
          <span className="document-icon">
            {getDocumentIcon(document.documentType)}
          </span>
          
          <span className="document-title">{document.title}</span>
          
          <span className="document-type-badge">{document.documentType}</span>
        </div>
        
        {hasChildren && isExpanded && (
          <div className="document-children">
            {children.map(child => (
              <DocumentTreeNode 
                key={child._id} 
                document={child} 
                level={level + 1}
                onSelect={onSelect}
                selectedId={selectedId}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return <div className="loading">Loading project...</div>;
  }

  if (!project) {
    return <div className="error">Project not found</div>;
  }

  const rootDocuments = buildDocumentTree();

  return (
    <div className="project-page">
      <header className="project-header">
        <div className="project-info">
          <h1>{project.name}</h1>
          {project.description && <p>{project.description}</p>}
        </div>
        <button 
          className="back-button"
          onClick={() => navigate('/dashboard')}
        >
          ← Back to Dashboard
        </button>
        <button 
          className="sync-button"
          onClick={() => handleSync(true)}
          disabled={isSyncing}
        >
          {isSyncing ? '🔄 Syncing...' : '🔄 Sync with Google Drive'}
        </button>
      </header>

      <div className="project-content">
        <aside className="sidebar">
          <div className="sidebar-section">
            <h3>Documents</h3>
            
            <form onSubmit={handleCreateDocument} className="new-document-form">
              <input
                type="text"
                value={newDocumentTitle}
                onChange={(e) => setNewDocumentTitle(e.target.value)}
                placeholder="New document title"
                className="title-input"
              />
              
              <select 
                value={selectedDocType}
                onChange={(e) => setSelectedDocType(e.target.value)}
                className="type-select"
              >
                {documentTypes.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              
              <select
                value={selectedParentId || ''}
                onChange={(e) => setSelectedParentId(e.target.value || null)}
                className="parent-select"
              >
                <option value="">📚 Root Level</option>
                {projectDocs
                  .filter(doc => ['book', 'part', 'chapter'].includes(doc.documentType))
                  .map(folder => (
                    <option key={folder._id} value={folder._id}>
                      {documentTypes.find(t => t.value === folder.documentType)?.label.split(' ')[0]} {folder.title}
                    </option>
                  ))
                }
              </select>
              
              <button type="submit" className="add-button">
                + Add
              </button>
            </form>
          </div>
          
          <div className="sidebar-section">
            <div className="document-tree">
              {rootDocuments.length === 0 ? (
                <div className="empty-state">
                  <p>No documents yet.</p>
                  <p>Create your first document above! 👆</p>
                </div>
              ) : (
                rootDocuments.map(doc => (
                  <DocumentTreeNode 
                    key={doc._id} 
                    document={doc} 
                    level={0}
                    onSelect={setSelectedDocId}
                    selectedId={selectedDocId}
                  />
                ))
              )}
            </div>
          </div>
        </aside>
        
        <main className="main-content">
          {selectedDocId ? (
            <DocumentViewer documentId={selectedDocId} />
          ) : (
            <div className="welcome-content">
              <h2>Welcome to {project.name}</h2>
              <p>Select a document from the sidebar to view or edit it.</p>
              <div className="quick-tips">
                <h3>Document Structure:</h3>
                <ul>
                  <li>📚 <strong>Books</strong> → 📑 <strong>Parts</strong> → 📖 <strong>Chapters</strong> (folders)</li>
                  <li>🎬 <strong>Scenes</strong> are individual Google Docs within chapters</li>
                  <li><strong>Drag scenes</strong> between chapters or reorder within chapters</li>
                  <li>👤 <strong>Characters</strong>, 🏛️ <strong>Places</strong>, 📝 <strong>Notes</strong> (reference docs)</li>
                  <li>Only <strong>scenes</strong> get compiled into your final manuscript</li>
                </ul>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

// Simple document viewer component
const DocumentViewer: React.FC<{ documentId: string }> = ({ documentId }) => {
  const [content, setContent] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadDocumentContent();
  }, [documentId]);

  const loadDocumentContent = async () => {
    setIsLoading(true);
    try {
      const response = await documents.getContent(documentId);
      setContent(response.data);
    } catch (error) {
      console.error('Failed to load document content:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div className="loading">Loading document...</div>;
  }

  return (
    <div className="document-viewer">
      <div className="document-actions">
        <button 
          className="edit-button"
          onClick={() => {
            // This will open Google Docs in a new tab
            // We'll need the Google Docs URL
            alert('Edit functionality coming soon - will open Google Docs');
          }}
        >
          ✏️ Edit in Google Docs
        </button>
      </div>
      
      {content ? (
        <div className="document-content">
          <h2>{content.title}</h2>
          {/* We'll need to render Google Docs content here */}
          <p>Document content will be displayed here</p>
        </div>
      ) : (
        <div>No content available</div>
      )}
    </div>
  );
};

export default Project;