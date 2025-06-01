// client/src/pages/Project.tsx - UPDATED FOR PROPER FOLDER STRUCTURE

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projects, documents } from '../services/api';
import DocumentDeleteModal from '../components/DocumentDeleteModal';
import './Project.css';

interface Document {
  _id?: string; // MongoDB ID (optional, for cached docs)
  id: string; // Google Drive ID
  title: string;
  documentType: string;
  parentId?: string;
  order: number;
  synopsis?: string;
  status?: 'draft' | 'review' | 'final' | 'published';
  tags?: string[];
  includeInCompile?: boolean;
  wordCount?: number;
  createdAt: string;
  updatedAt: string;
  customFields?: Record<string, any>;
}

interface ProjectData {
  _id: string;
  name: string;
  description?: string;
  rootFolderId: string;
  createdAt: string;
  updatedAt: string;
  metadata?: {
    structure?: {
      chaptersId: string;
      notesId: string;
      charactersId: string;
      researchId: string;
      placesId: string;
      miscId: string;
    };
  };
}

const Project = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [projectDocs, setProjectDocs] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newDocumentTitle, setNewDocumentTitle] = useState('');
  const [selectedDocType, setSelectedDocType] = useState('scene');
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Delete modal state
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    document: Document | null;
    isDeleting: boolean;
  }>({
    isOpen: false,
    document: null,
    isDeleting: false
  });

  useEffect(() => {
    if (!id) return;
    
    const loadProjectData = async () => {
      setIsLoading(true);
      try {
        // Load project details
        const projectResponse = await projects.getById(id);
        setProject(projectResponse.data as ProjectData);
        
        // Load project documents from JSON index
        const docsResponse = await documents.getByProject(id);
        setProjectDocs(docsResponse.data as Document[]);
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
    if (!newDocumentTitle.trim() || !project || isCreating) return;
    
    setIsCreating(true);
    try {
      // Determine the correct parent ID based on document type and selection
      let parentId = selectedParentId;
      
      if (!parentId || parentId === 'root') {
        // Use appropriate default parent based on document type
        parentId = getDefaultParentForType(selectedDocType);
      }
      
      const response = await documents.create({
        title: newDocumentTitle,
        documentType: selectedDocType,
        parentId: parentId,
        projectId: project._id,
      });
      
      // Add the new document to the list
      setProjectDocs([...projectDocs, response.data as Document]);
      
      // Clear the form
      setNewDocumentTitle('');
      setSelectedParentId(null);
    } catch (error) {
      console.error('Failed to create document:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const getDefaultParentForType = (documentType: string): string => {
    const structure = project?.metadata?.structure;
    if (!structure) return project?.rootFolderId || '';
    
    switch (documentType) {
      case 'chapter':
      case 'scene':
        return structure.chaptersId;
      case 'character':
        return structure.charactersId;
      case 'setting':
      case 'place':
        return structure.placesId;
      case 'research':
        return structure.researchId;
      case 'note':
        return structure.miscId;
      default:
        return structure.chaptersId;
    }
  };

  const handleDeleteClick = (document: Document, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteModal({
      isOpen: true,
      document,
      isDeleting: false
    });
  };

  const handleDeleteConfirm = async (force: boolean = false) => {
    if (!deleteModal.document) return;

    setDeleteModal(prev => ({ ...prev, isDeleting: true }));

    try {
      await documents.delete(deleteModal.document.id, force);
      
      // Remove the document and its descendants from local state
      const deleteDocumentAndDescendants = (docId: string): void => {
        setProjectDocs(prevDocs => {
          const remainingDocs = prevDocs.filter(doc => {
            if (doc.id === docId) return false;
            
            // Check if this document is a descendant of the deleted document
            let currentParentId = doc.parentId;
            const visited = new Set<string>();
            
            while (currentParentId && !visited.has(currentParentId)) {
              visited.add(currentParentId);
              if (currentParentId === docId) return false;
              
              // eslint-disable-next-line no-loop-func
              const parentDoc = prevDocs.find(d => d.id === currentParentId);
              currentParentId = parentDoc?.parentId;
            }
            
            return true;
          });
          return remainingDocs;
        });
      };
      
      deleteDocumentAndDescendants(deleteModal.document.id);
      
      // Close modal
      setDeleteModal({
        isOpen: false,
        document: null,
        isDeleting: false
      });
      
      console.log('Document deleted successfully');
    } catch (error) {
      console.error('Failed to delete document:', error);
      setDeleteModal(prev => ({ ...prev, isDeleting: false }));
    }
  };

  const handleDeleteCancel = () => {
    setDeleteModal({
      isOpen: false,
      document: null,
      isDeleting: false
    });
  };

  // Function to organize documents into a tree structure
  const organizeDocuments = () => {
    const rootDocs = projectDocs.filter(doc => !doc.parentId || doc.parentId === project?.rootFolderId);
    return rootDocs.sort((a, b) => a.order - b.order);
  };

  // Get children of a specific document
  const getChildrenOf = (parentId: string) => {
    return projectDocs
      .filter(doc => doc.parentId === parentId)
      .sort((a, b) => a.order - b.order);
  };

  // Get the icon for each document type
  const getDocumentIcon = (type: string) => {
    const icons: Record<string, string> = {
      folder: '📁',
      part: '📚',
      chapter: '📖',
      scene: '🎬',
      character: '👤',
      setting: '🏞️',
      place: '🗺️',
      note: '📝',
      research: '🔬'
    };
    return icons[type] || '📄';
  };

  // Get available parent folders for the document type selector
  const getAvailableParents = (documentType: string) => {
    const structure = project?.metadata?.structure;
    const options = [{ id: 'root', name: '📁 Default Location', disabled: false }];
    
    if (structure) {
      // Add main folders based on document type
      switch (documentType) {
        case 'chapter':
        case 'scene':
          options.push({ 
            id: structure.chaptersId, 
            name: '📖 Chapters', 
            disabled: false 
          });
          // Add existing chapters as options for scenes
          if (documentType === 'scene') {
            const chapters = projectDocs.filter(doc => 
              doc.documentType === 'chapter' && 
              doc.parentId === structure.chaptersId
            );
            chapters.forEach(chapter => {
              options.push({
                id: chapter.id,
                name: `   📖 ${chapter.title}`,
                disabled: false
              });
            });
          }
          break;
          
        case 'character':
          options.push({ 
            id: structure.charactersId, 
            name: '👤 Characters', 
            disabled: false 
          });
          break;
          
        case 'setting':
        case 'place':
          options.push({ 
            id: structure.placesId, 
            name: '🗺️ Places', 
            disabled: false 
          });
          break;
          
        case 'research':
          options.push({ 
            id: structure.researchId, 
            name: '🔬 Research', 
            disabled: false 
          });
          break;
          
        case 'note':
          options.push({ 
            id: structure.miscId, 
            name: '📝 Notes', 
            disabled: false 
          });
          break;
      }
    }
    
    // Add other folders as options
    const folders = projectDocs.filter(doc => 
      doc.documentType === 'folder' || doc.documentType === 'part'
    );
    folders.forEach(folder => {
      options.push({
        id: folder.id,
        name: `${getDocumentIcon(folder.documentType)} ${folder.title}`,
        disabled: false
      });
    });
    
    return options;
  };

  // Recursive component to render document tree
  const DocumentNode = ({ document, level = 0 }: { document: Document; level?: number }) => {
    const children = getChildrenOf(document.id);
    const indent = level * 20;
    
    return (
      <div className="document-node">
        <div 
          className={`document-item ${document.documentType}`}
          style={{ paddingLeft: `${indent + 12}px` }}
        >
          <div className="document-info">
            <span className="document-icon">
              {getDocumentIcon(document.documentType)}
            </span>
            <span className="document-title">{document.title}</span>
            <span className={`document-type-badge ${document.documentType}`}>
              {document.documentType}
            </span>
          </div>
          
          <div className="document-actions">
            {(document.documentType === 'scene' || document.documentType === 'character' || 
              document.documentType === 'setting' || document.documentType === 'research' || 
              document.documentType === 'note') && (
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                title="Open in Google Docs"
                onClick={() => window.open(`https://docs.google.com/document/d/${document.id}/edit`, '_blank')}
              >
                📝
              </button>
            )}
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={(e) => handleDeleteClick(document, e)}
              title={`Delete ${document.documentType}`}
            >
              🗑️
            </button>
          </div>
        </div>
        
        {children.length > 0 && (
          <div className="document-children">
            {children.map(child => (
              <DocumentNode key={child.id} document={child} level={level + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="spinner large"></div>
        <p>Loading project...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="error-container">
        <h2>Project not found</h2>
        <button onClick={() => navigate('/dashboard')} className="btn btn-primary">
          ← Back to Dashboard
        </button>
      </div>
    );
  }

  const rootDocuments = organizeDocuments();
  const availableParents = getAvailableParents(selectedDocType);

  return (
    <div className="project-page">
      <header className="project-header">
        <div className="project-info">
          <h1>📚 {project.name}</h1>
          {project.description && <p className="project-description">{project.description}</p>}
          <p className="project-meta">
            Created: {new Date(project.createdAt).toLocaleDateString()} | 
            Documents: {projectDocs.length}
          </p>
        </div>
        <div className="project-actions">
          <button onClick={() => navigate('/dashboard')} className="btn btn-secondary">
            ← Dashboard
          </button>
        </div>
      </header>

      <div className="project-content">
        <aside className="document-sidebar">
          <div className="sidebar-header">
            <h2>📋 Project Structure</h2>
          </div>
          
          <div className="create-document-section">
            <h3>Add New Document</h3>
            <form onSubmit={handleCreateDocument} className="create-document-form">
              <input
                type="text"
                value={newDocumentTitle}
                onChange={(e) => setNewDocumentTitle(e.target.value)}
                placeholder="Document title..."
                className="document-input"
                disabled={isCreating}
              />
              
              <select 
                value={selectedDocType}
                onChange={(e) => {
                  setSelectedDocType(e.target.value);
                  setSelectedParentId(null); // Reset parent when type changes
                }}
                className="document-type-select"
                disabled={isCreating}
              >
                <option value="scene">🎬 Scene</option>
                <option value="chapter">📖 Chapter</option>
                <option value="character">👤 Character</option>
                <option value="setting">🏞️ Setting</option>
                <option value="place">🗺️ Place</option>
                <option value="research">🔬 Research</option>
                <option value="note">📝 Note</option>
                <option value="folder">📁 Folder</option>
                <option value="part">📚 Part</option>
              </select>
              
              <select
                value={selectedParentId || ''}
                onChange={(e) => setSelectedParentId(e.target.value || null)}
                className="parent-select"
                disabled={isCreating}
              >
                {availableParents.map(parent => (
                  <option 
                    key={parent.id} 
                    value={parent.id === 'root' ? '' : parent.id}
                    disabled={parent.disabled}
                  >
                    {parent.name}
                  </option>
                ))}
              </select>
              
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={isCreating || !newDocumentTitle.trim()}
              >
                {isCreating ? (
                  <>
                    <span className="spinner small"></span>
                    Adding...
                  </>
                ) : (
                  '✨ Add Document'
                )}
              </button>
            </form>
          </div>
          
          <div className="document-tree">
            {rootDocuments.length === 0 ? (
              <div className="empty-documents">
                <div className="empty-icon">📄</div>
                <p>No documents yet.</p>
                <p>Create your first document above!</p>
              </div>
            ) : (
              <div className="document-list">
                {rootDocuments.map(doc => (
                  <DocumentNode key={doc.id} document={doc} />
                ))}
              </div>
            )}
          </div>
        </aside>
        
        <main className="document-workspace">
          <div className="workspace-placeholder">
            <div className="placeholder-icon">✨</div>
            <h3>Select a document to edit</h3>
            <p>Choose a document from the project structure on the left to view or edit its content.</p>
            <div className="structure-hint">
              <h4>📁 Folder Structure:</h4>
              <ul>
                <li><strong>Chapters/</strong> - Chapter folders containing scenes</li>
                <li><strong>Notes/Characters/</strong> - Character profiles</li>
                <li><strong>Notes/Places/</strong> - Setting descriptions</li>
                <li><strong>Notes/Research/</strong> - Research materials</li>
                <li><strong>Notes/Misc/</strong> - General notes</li>
              </ul>
            </div>
          </div>
        </main>
      </div>

      <DocumentDeleteModal
        isOpen={deleteModal.isOpen}
        documentId={deleteModal.document?.id || null}
        documentName={deleteModal.document?.title || ''}
        documentType={deleteModal.document?.documentType || ''}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        isDeleting={deleteModal.isDeleting}
      />
    </div>
  );
};

export default Project;