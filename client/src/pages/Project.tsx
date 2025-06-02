// client/src/pages/Project.tsx - FIXED ALL SET ISSUES

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projects, documents } from '../services/api';
import DocumentDeleteModal from '../components/DocumentDeleteModal';
import './Project.css';

interface Document {
  _id?: string;
  id: string;
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

interface TreeNodeProps {
  document: Document;
  level: number;
  children: Document[];
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  onDragStart: (e: React.DragEvent, doc: Document) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, targetDoc: Document) => void;
  onSelect: (doc: Document) => void;
  onDelete: (doc: Document) => void;
  selectedId?: string;
  isDragOver: boolean;
  canDrop: boolean;
  allDocuments: Document[];
  expandedNodes: string[];
}

const TreeNode: React.FC<TreeNodeProps> = ({
  document,
  level,
  children,
  isExpanded,
  onToggleExpand,
  onDragStart,
  onDragOver,
  onDrop,
  onSelect,
  onDelete,
  selectedId,
  isDragOver,
  canDrop,
  allDocuments,
  expandedNodes
}) => {
  const hasChildren = children.length > 0;
  const isFolder = ['folder', 'chapter', 'part'].includes(document.documentType);
  const isSelected = selectedId === document.id;
  
  const getIcon = (type: string) => {
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

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasChildren && isFolder) {
      onToggleExpand(document.id);
    }
    onSelect(document);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(document);
  };

  return (
    <div className="tree-node">
      <div
        className={`tree-item ${isDragOver && canDrop ? 'drag-over' : ''} ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${level * 20 + 12}px` }}
        draggable
        onDragStart={(e) => onDragStart(e, document)}
        onDragOver={onDragOver}
        onDrop={(e) => onDrop(e, document)}
        onClick={handleClick}
      >
        <div className="tree-content">
          {hasChildren && isFolder && (
            <button
              className={`expand-button ${isExpanded ? 'expanded' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(document.id);
              }}
            >
              ▶
            </button>
          )}
          <span className="doc-icon">{getIcon(document.documentType)}</span>
          <span className="doc-title">{document.title}</span>
          <span className={`doc-type-badge ${document.documentType}`}>
            {document.documentType}
          </span>
        </div>
        
        <div className="tree-actions">
          {!isFolder && (
            <button
              className="action-btn edit-btn"
              onClick={(e) => {
                e.stopPropagation();
                window.open(`https://docs.google.com/document/d/${document.id}/edit`, '_blank');
              }}
              title="Edit in Google Docs"
            >
              ✏️
            </button>
          )}
          <button
            className="action-btn delete-btn"
            onClick={handleDeleteClick}
            title="Delete"
          >
            🗑️
          </button>
        </div>
      </div>
      
      {hasChildren && isExpanded && (
        <div className="tree-children">
          {children.map(child => (
            <TreeNodeContainer
              key={child.id}
              document={child}
              level={level + 1}
              selectedId={selectedId}
              onToggleExpand={onToggleExpand}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onSelect={onSelect}
              onDelete={onDelete}
              allDocuments={allDocuments}
              expandedNodes={expandedNodes}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface TreeNodeContainerProps {
  document: Document;
  level: number;
  selectedId?: string;
  onToggleExpand: (id: string) => void;
  onDragStart: (e: React.DragEvent, doc: Document) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, targetDoc: Document) => void;
  onSelect: (doc: Document) => void;
  onDelete: (doc: Document) => void;
  allDocuments: Document[];
  expandedNodes: string[];
}

const TreeNodeContainer: React.FC<TreeNodeContainerProps> = (props) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [canDrop, setCanDrop] = useState(false);
  
  const children = props.allDocuments
    .filter(doc => doc.parentId === props.document.id)
    .sort((a, b) => a.order - b.order);
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
    setCanDrop(['folder', 'chapter', 'part'].includes(props.document.documentType));
  };
  
  const handleDragLeave = () => {
    setIsDragOver(false);
    setCanDrop(false);
  };
  
  const handleDrop = (e: React.DragEvent, targetDoc: Document) => {
    e.preventDefault();
    setIsDragOver(false);
    setCanDrop(false);
    props.onDrop(e, targetDoc);
  };
  
  return (
    <div onDragLeave={handleDragLeave}>
      <TreeNode
        document={props.document}
        level={props.level}
        children={children}
        isExpanded={props.expandedNodes.includes(props.document.id)}
        onToggleExpand={props.onToggleExpand}
        onDragStart={props.onDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onSelect={props.onSelect}
        onDelete={props.onDelete}
        selectedId={props.selectedId}
        isDragOver={isDragOver}
        canDrop={canDrop}
        allDocuments={props.allDocuments}
        expandedNodes={props.expandedNodes}
      />
    </div>
  );
};

const Project = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [projectDocs, setProjectDocs] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<string[]>([]);
  const [draggedDocument, setDraggedDocument] = useState<Document | null>(null);
  
  // New document form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocType, setNewDocType] = useState('scene');
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
        const [projectResponse, docsResponse] = await Promise.all([
          projects.getById(id),
          documents.getByProject(id)
        ]);
        
        setProject(projectResponse.data as ProjectData);
        setProjectDocs(docsResponse.data as Document[]);
        
        const docs = docsResponse.data as Document[];
        const mainFolders = docs.filter(doc => 
          !doc.parentId && ['folder', 'chapter', 'part'].includes(doc.documentType)
        );
        setExpandedNodes(mainFolders.map(folder => folder.id));
      } catch (error) {
        console.error('Failed to load project data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadProjectData();
  }, [id]);

  const getRootDocuments = () => {
    return projectDocs
      .filter(doc => !doc.parentId || doc.parentId === project?.rootFolderId)
      .sort((a, b) => a.order - b.order);
  };

  const handleToggleExpand = (nodeId: string) => {
    setExpandedNodes(prev => {
      if (prev.includes(nodeId)) {
        return prev.filter(id => id !== nodeId);
      } else {
        return [...prev, nodeId];
      }
    });
  };

  const handleDragStart = (e: React.DragEvent, doc: Document) => {
    setDraggedDocument(doc);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', doc.id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const isDescendant = (parentId: string, childId: string): boolean => {
    let currentDoc = projectDocs.find(doc => doc.id === childId);
    const visited: string[] = [];
    
    while (currentDoc?.parentId && !visited.includes(currentDoc.parentId)) {
      visited.push(currentDoc.parentId);
      if (currentDoc.parentId === parentId) return true;
      // eslint-disable-next-line no-loop-func
      currentDoc = projectDocs.find(doc => doc.id === currentDoc!.parentId);
    }
    
    return false;
  };

  const handleDrop = async (e: React.DragEvent, targetDoc: Document) => {
    e.preventDefault();
    
    if (!draggedDocument || draggedDocument.id === targetDoc.id) {
      setDraggedDocument(null);
      return;
    }

    const canAcceptDrop = ['folder', 'chapter', 'part'].includes(targetDoc.documentType);
    
    if (!canAcceptDrop) {
      setDraggedDocument(null);
      return;
    }

    if (isDescendant(draggedDocument.id, targetDoc.id)) {
      console.warn('Cannot move folder into its own descendant');
      setDraggedDocument(null);
      return;
    }

    try {
      setProjectDocs(prev => prev.map(doc => {
        if (doc.id === draggedDocument.id) {
          return { ...doc, parentId: targetDoc.id };
        }
        return doc;
      }));
      
      setExpandedNodes(prev => {
        if (!prev.includes(targetDoc.id)) {
          return [...prev, targetDoc.id];
        }
        return prev;
      });
      
      console.log(`Moved "${draggedDocument.title}" to "${targetDoc.title}"`);
    } catch (error) {
      console.error('Failed to move document:', error);
      setProjectDocs(prev => prev.map(doc => {
        if (doc.id === draggedDocument.id) {
          return { ...doc, parentId: draggedDocument.parentId };
        }
        return doc;
      }));
    }
    
    setDraggedDocument(null);
  };

  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocTitle.trim() || !project) return;
    
    setIsCreating(true);
    try {
      const parentId = selectedDocument?.id && ['folder', 'chapter', 'part'].includes(selectedDocument.documentType) 
        ? selectedDocument.id 
        : getDefaultParentForType(newDocType);

      const response = await documents.create({
        title: newDocTitle,
        documentType: newDocType,
        parentId: parentId,
        projectId: project._id,
      });
      
      setProjectDocs(prev => [...prev, response.data as Document]);
      setNewDocTitle('');
      setShowCreateForm(false);
      
      if (parentId) {
        setExpandedNodes(prev => {
          if (!prev.includes(parentId)) {
            return [...prev, parentId];
          }
          return prev;
        });
      }
      
      console.log(`Created ${newDocType} "${newDocTitle}"`);
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

  const handleDeleteClick = (document: Document) => {
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
      
      const deleteDocumentAndDescendants = (docId: string): void => {
        setProjectDocs(prevDocs => {
          const isDescendantOf = (checkDocId: string, targetDocId: string, docs: Document[]): boolean => {
            let currentDoc = docs.find(d => d.id === checkDocId);
            const visitedIds: string[] = [];
            
            while (currentDoc?.parentId && !visitedIds.includes(currentDoc.parentId)) {
              visitedIds.push(currentDoc.parentId);
              if (currentDoc.parentId === targetDocId) return true;
              // eslint-disable-next-line no-loop-func
              currentDoc = docs.find(d => d.id === currentDoc!.parentId);
            }
            
            return false;
          };
          
          return prevDocs.filter(doc => {
            return doc.id !== docId && !isDescendantOf(doc.id, docId, prevDocs);
          });
        });
      };
      
      deleteDocumentAndDescendants(deleteModal.document.id);
      
      if (selectedDocument?.id === deleteModal.document.id) {
        setSelectedDocument(null);
      }
      
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

  const getIcon = (type: string) => {
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

  const rootDocuments = getRootDocuments();

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
            <div className="sidebar-title-row">
              <h2>📋 Project Structure</h2>
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="btn btn-sm btn-primary"
                title="Add new document"
              >
                ➕
              </button>
            </div>
            
            {showCreateForm && (
              <div className="create-form">
                <form onSubmit={handleCreateDocument} className="create-document-form">
                  <input
                    type="text"
                    value={newDocTitle}
                    onChange={(e) => setNewDocTitle(e.target.value)}
                    placeholder="Document title..."
                    className="document-input"
                    disabled={isCreating}
                  />
                  <select
                    value={newDocType}
                    onChange={(e) => setNewDocType(e.target.value)}
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
                  <div className="form-buttons">
                    <button
                      type="submit"
                      disabled={isCreating || !newDocTitle.trim()}
                      className="btn btn-sm btn-primary"
                    >
                      {isCreating ? 'Adding...' : 'Add'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="btn btn-sm btn-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
          
          <div className="document-tree">
            {rootDocuments.length === 0 ? (
              <div className="empty-documents">
                <div className="empty-icon">📄</div>
                <p>No documents yet.</p>
                <p>Click "+" to create your first document!</p>
              </div>
            ) : (
              <div className="tree-list">
                {rootDocuments.map(doc => (
                  <TreeNodeContainer
                    key={doc.id}
                    document={doc}
                    level={0}
                    selectedId={selectedDocument?.id}
                    onToggleExpand={handleToggleExpand}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onSelect={setSelectedDocument}
                    onDelete={handleDeleteClick}
                    allDocuments={projectDocs}
                    expandedNodes={expandedNodes}
                  />
                ))}
              </div>
            )}
          </div>
        </aside>
        
        <main className="document-workspace">
          {selectedDocument ? (
            <div className="document-details">
              <div className="document-header">
                <div className="document-title-row">
                  <span className="document-icon-large">
                    {getIcon(selectedDocument.documentType)}
                  </span>
                  <div>
                    <h3>{selectedDocument.title}</h3>
                    <span className={`document-type-badge ${selectedDocument.documentType}`}>
                      {selectedDocument.documentType}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="document-metadata">
                <div className="metadata-grid">
                  <div className="metadata-item">
                    <strong>Created:</strong> {new Date(selectedDocument.createdAt).toLocaleDateString()}
                  </div>
                  <div className="metadata-item">
                    <strong>Updated:</strong> {new Date(selectedDocument.updatedAt).toLocaleDateString()}
                  </div>
                  {selectedDocument.wordCount && (
                    <div className="metadata-item">
                      <strong>Word Count:</strong> {selectedDocument.wordCount.toLocaleString()}
                    </div>
                  )}
                  {selectedDocument.status && (
                    <div className="metadata-item">
                      <strong>Status:</strong> 
                      <span className={`status-badge ${selectedDocument.status}`}>
                        {selectedDocument.status}
                      </span>
                    </div>
                  )}
                </div>
                
                {selectedDocument.synopsis && (
                  <div className="synopsis-section">
                    <h4>Synopsis</h4>
                    <p>{selectedDocument.synopsis}</p>
                  </div>
                )}
                
                {selectedDocument.tags && selectedDocument.tags.length > 0 && (
                  <div className="tags-section">
                    <h4>Tags</h4>
                    <div className="tags-list">
                      {selectedDocument.tags.map(tag => (
                        <span key={tag} className="tag">{tag}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              {!['folder', 'chapter', 'part'].includes(selectedDocument.documentType) && (
                <div className="document-actions-section">
                  <button
                    onClick={() => window.open(`https://docs.google.com/document/d/${selectedDocument.id}/edit`, '_blank')}
                    className="btn btn-primary"
                  >
                    📝 Edit in Google Docs
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="workspace-placeholder">
              <div className="placeholder-icon">✨</div>
              <h3>Select a document to view</h3>
              <p>Choose a document from the project tree to see its details and edit it.</p>
              <div className="tips-section">
                <h4>💡 Interactive Features:</h4>
                <ul>
                  <li>• <strong>Drag & Drop:</strong> Drag documents between folders to reorganize</li>
                  <li>• <strong>Expand/Collapse:</strong> Click folder icons to show/hide contents</li>
                  <li>• <strong>Organization:</strong> Use chapters to group scenes, folders for organization</li>
                </ul>
              </div>
            </div>
          )}
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