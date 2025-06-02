import React, { useState, useEffect, useMemo } from 'react';
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
  onToggleExpand: (id: string) => void;
  onDragStart: (e: React.DragEvent, doc: Document) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, targetDoc: Document) => void;
  onSelect: (doc: Document) => void;
  onDelete: (doc: Document) => void;
  selectedId?: string;
  allDocuments: Document[];
  expandedNodes: string[];
  childrenMap: Map<string, Document[]>;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  document,
  level,
  onToggleExpand,
  onDragStart,
  onDragOver,
  onDrop,
  onSelect,
  onDelete,
  selectedId,
  allDocuments,
  expandedNodes,
  childrenMap
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [canDrop, setCanDrop] = useState(false);
  const [beingDragged, setBeingDragged] = useState(false);
  
  const children = childrenMap.get(document.id) || [];
  const hasChildren = children.length > 0;
  const isFolder = ['folder', 'chapter', 'part'].includes(document.documentType);
  const isSelected = selectedId === document.id;
  const isExpanded = expandedNodes.includes(document.id);
  
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
    console.log('Selecting document:', document.title, 'ID:', document.id);
    onSelect(document);
    if (hasChildren && isFolder && e.detail === 2) { // Double click to expand
      onToggleExpand(document.id);
    }
  };

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpand(document.id);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(document);
  };

  const handleDragStart = (e: React.DragEvent) => {
    setBeingDragged(true);
    // Set the data for the drag operation
    e.dataTransfer.setData('text/plain', document.id);
    e.dataTransfer.effectAllowed = 'move';
    onDragStart(e, document);
  };

  const handleDragEnd = () => {
    setBeingDragged(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const canAcceptDrop = ['folder', 'chapter', 'part'].includes(document.documentType);
    setIsDragOver(true);
    setCanDrop(canAcceptDrop);
    onDragOver(e);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    // Only clear if we're actually leaving this element
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
      setCanDrop(false);
    }
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    setCanDrop(false);
    
    // Get the dragged document ID
    const draggedDocId = e.dataTransfer.getData('text/plain');
    if (draggedDocId && canDrop) {
      onDrop(e, document);
    }
  };

  return (
    <div className="tree-node">
      <div
        className={`tree-item ${isDragOver && canDrop ? 'drag-over-inside' : ''} ${isSelected ? 'selected' : ''} ${beingDragged ? 'being-dragged' : ''}`}
        style={{ paddingLeft: `${level * 20 + 12}px` }}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <div className="tree-content">
          {hasChildren && isFolder && (
            <button
              className={`expand-button ${isExpanded ? 'expanded' : ''}`}
              onClick={handleExpandClick}
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
                console.log('Edit document:', document.title);
              }}
              title="Edit document"
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
            <TreeNode
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
              childrenMap={childrenMap}
            />
          ))}
        </div>
      )}
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
  const [isMoving, setIsMoving] = useState(false);
  
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

  // Memoize the children map to prevent recalculation on every render
  const childrenMap = useMemo(() => {
    const map = new Map<string, Document[]>();
    
    // Group documents by parent
    projectDocs.forEach(doc => {
      const parentId = doc.parentId || 'root';
      if (!map.has(parentId)) {
        map.set(parentId, []);
      }
      map.get(parentId)!.push(doc);
    });
    
    // Sort children by order
    map.forEach((children) => {
      children.sort((a, b) => a.order - b.order);
    });
    
    return map;
  }, [projectDocs]);

  const getRootDocuments = useMemo(() => {
    return projectDocs
      .filter(doc => !doc.parentId || doc.parentId === project?.rootFolderId)
      .sort((a, b) => a.order - b.order);
  }, [projectDocs, project?.rootFolderId]);

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
        
        // Map the backend data to frontend format
        const docs = (docsResponse.data as any[]).map(doc => ({
          ...doc,
          id: doc._id, // Map _id to id for frontend consistency
          parentId: doc.parent // Map parent to parentId
        }));
        
        setProjectDocs(docs as Document[]);
        
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
    // Store the document ID in the data transfer
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
      currentDoc = projectDocs.find(doc => doc.id === currentDoc!.parentId);
    }
    
    return false;
  };

  const handleDrop = async (e: React.DragEvent, targetDoc: Document) => {
    e.preventDefault();
    
    // Get the dragged document ID from the data transfer
    const draggedDocId = e.dataTransfer.getData('text/plain');
    const draggedDoc = projectDocs.find(doc => doc.id === draggedDocId);
    
    if (!draggedDoc || draggedDoc.id === targetDoc.id || isMoving) {
      setDraggedDocument(null);
      return;
    }

    const canAcceptDrop = ['folder', 'chapter', 'part'].includes(targetDoc.documentType);
    
    if (!canAcceptDrop) {
      console.log('Cannot drop here - target is not a folder');
      setDraggedDocument(null);
      return;
    }

    if (isDescendant(draggedDoc.id, targetDoc.id)) {
      console.warn('Cannot move folder into its own descendant');
      setDraggedDocument(null);
      return;
    }

    const originalParentId = draggedDoc.parentId;
    
    // Optimistically update the UI
    setProjectDocs(prev => prev.map(doc => {
      if (doc.id === draggedDoc.id) {
        return { ...doc, parentId: targetDoc.id };
      }
      return doc;
    }));
    
    // Expand the target folder
    setExpandedNodes(prev => {
      if (!prev.includes(targetDoc.id)) {
        return [...prev, targetDoc.id];
      }
      return prev;
    });

    setIsMoving(true);
    try {
      await documents.move(draggedDoc.id, {
        newParentId: targetDoc.id
      });
      
      console.log(`✅ Successfully moved "${draggedDoc.title}" to "${targetDoc.title}"`);
    } catch (error) {
      console.error('❌ Failed to move document on backend:', error);
      
      // Revert the change
      setProjectDocs(prev => prev.map(doc => {
        if (doc.id === draggedDoc.id) {
          return { ...doc, parentId: originalParentId };
        }
        return doc;
      }));
      
      alert(`Failed to move "${draggedDoc.title}". The change has been reverted.`);
    } finally {
      setIsMoving(false);
      setDraggedDocument(null);
    }
  };

  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocTitle.trim() || !project) return;
    
    setIsCreating(true);
    try {
      let parentId: string | undefined;
      
      if (selectedDocument) {
        if (['folder', 'chapter', 'part'].includes(selectedDocument.documentType)) {
          parentId = selectedDocument.id;
        } else {
          if (selectedDocument.parentId) {
            parentId = selectedDocument.parentId;
          } else {
            const parentDoc = projectDocs.find(doc => 
              ['folder', 'chapter', 'part'].includes(doc.documentType) &&
              projectDocs.some(child => child.parentId === doc.id && child.id === selectedDocument.id)
            );
            parentId = parentDoc?.id;
          }
        }
      }

      const response = await documents.create({
        title: newDocTitle,
        documentType: newDocType,
        parentId: parentId,
        projectId: project._id,
      });
      
      // Map the response to frontend format
      const newDoc = {
        ...response.data,
        id: response.data._id,
        parentId: response.data.parent
      };
      
      setProjectDocs(prev => [...prev, newDoc as Document]);
      setNewDocTitle('');
      setShowCreateForm(false);
      
      if (parentId) {
        setExpandedNodes(prev => {
          if (!prev.includes(parentId!)) {
            return [...prev, parentId!];
          }
          return prev;
        });
      }
      
      const locationContext = selectedDocument 
        ? ['folder', 'chapter', 'part'].includes(selectedDocument.documentType)
          ? `inside "${selectedDocument.title}"`
          : `in same location as "${selectedDocument.title}"`
        : 'in default location';
      
      console.log(`Created ${newDocType} "${newDocTitle}" ${locationContext}`);
    } catch (error) {
      console.error('Failed to create document:', error);
    } finally {
      setIsCreating(false);
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

  return (
    <div className="project-page">
      <header className="project-header">
        <div className="project-info">
          <h1>📚 {project.name}</h1>
          {project.description && <p className="project-description">{project.description}</p>}
          <p className="project-meta">
            Created: {new Date(project.createdAt).toLocaleDateString()} | 
            Documents: {projectDocs.length}
            {isMoving && <span className="move-indicator"> | Moving document...</span>}
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
                disabled={isMoving}
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
                    disabled={isCreating || isMoving}
                  />
                  <select
                    value={newDocType}
                    onChange={(e) => setNewDocType(e.target.value)}
                    className="document-type-select"
                    disabled={isCreating || isMoving}
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
                      disabled={isCreating || !newDocTitle.trim() || isMoving}
                      className="btn btn-sm btn-primary"
                    >
                      {isCreating ? 'Adding...' : 'Add'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="btn btn-sm btn-secondary"
                      disabled={isMoving}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
          
          <div className="document-tree">
            {getRootDocuments.length === 0 ? (
              <div className="empty-documents">
                <div className="empty-icon">📄</div>
                <p>No documents yet.</p>
                <p>Click "+" to create your first document!</p>
              </div>
            ) : (
              <div className="tree-list">
                {getRootDocuments.map(doc => (
                  <TreeNode
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
                    childrenMap={childrenMap}
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
                    onClick={() => console.log('Edit document:', selectedDocument.title)}
                    className="btn btn-primary"
                  >
                    📝 Edit Document
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
                  {isMoving && <li>• <strong>Moving...</strong> Document move in progress</li>}
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