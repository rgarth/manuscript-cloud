// client/src/pages/Project.tsx - COMPLETE FILE WITH DRAG AND DROP ORDERING

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projects, documents } from '../services/api';
import DocumentEditor from '../components/DocumentEditor';
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
  onDragOver: (e: React.DragEvent, position: 'before' | 'after' | 'inside') => void;
  onDrop: (e: React.DragEvent, targetDoc: Document, position: 'before' | 'after' | 'inside') => void;
  onSelect: (doc: Document) => void;
  onDelete: (doc: Document) => void;
  selectedId?: string;
  isDragOver: boolean;
  dragPosition: 'before' | 'after' | 'inside' | null;
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
  dragPosition,
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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;
    
    let position: 'before' | 'after' | 'inside';
    
    if (isFolder && y > height * 0.25 && y < height * 0.75) {
      position = 'inside';
    } else if (y < height / 2) {
      position = 'before';
    } else {
      position = 'after';
    }
    
    onDragOver(e, position);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;
    
    let position: 'before' | 'after' | 'inside';
    
    if (isFolder && y > height * 0.25 && y < height * 0.75) {
      position = 'inside';
    } else if (y < height / 2) {
      position = 'before';
    } else {
      position = 'after';
    }
    
    onDrop(e, document, position);
  };

  const getDropIndicatorClass = () => {
    if (!isDragOver || !canDrop) return '';
    
    switch (dragPosition) {
      case 'before': return 'drag-over-before';
      case 'after': return 'drag-over-after';
      case 'inside': return 'drag-over-inside';
      default: return '';
    }
  };

  return (
    <div className="tree-node">
      <div
        className={`tree-item ${getDropIndicatorClass()} ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${level * 20 + 12}px` }}
        draggable
        onDragStart={(e) => onDragStart(e, document)}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
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
  onDragOver: (e: React.DragEvent, position: 'before' | 'after' | 'inside') => void;
  onDrop: (e: React.DragEvent, targetDoc: Document, position: 'before' | 'after' | 'inside') => void;
  onSelect: (doc: Document) => void;
  onDelete: (doc: Document) => void;
  allDocuments: Document[];
  expandedNodes: string[];
}

const TreeNodeContainer: React.FC<TreeNodeContainerProps> = (props) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragPosition, setDragPosition] = useState<'before' | 'after' | 'inside' | null>(null);
  const [canDrop, setCanDrop] = useState(false);
  
  const children = props.allDocuments
    .filter(doc => doc.parentId === props.document.id)
    .sort((a, b) => a.order - b.order); // Sort by order field
  
  const handleDragOver = (e: React.DragEvent, position: 'before' | 'after' | 'inside') => {
    e.preventDefault();
    setIsDragOver(true);
    setDragPosition(position);
    
    // Can drop inside folders, or before/after any document
    const canDropInside = position === 'inside' && ['folder', 'chapter', 'part'].includes(props.document.documentType);
    const canDropAdjacent = position === 'before' || position === 'after';
    
    setCanDrop(canDropInside || canDropAdjacent);
  };
  
  const handleDragLeave = () => {
    setIsDragOver(false);
    setDragPosition(null);
    setCanDrop(false);
  };
  
  const handleDrop = (e: React.DragEvent, targetDoc: Document, position: 'before' | 'after' | 'inside') => {
    e.preventDefault();
    setIsDragOver(false);
    setDragPosition(null);
    setCanDrop(false);
    props.onDrop(e, targetDoc, position);
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
        dragPosition={dragPosition}
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
      .sort((a, b) => a.order - b.order); // Sort by order field
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

  const handleDragOver = (e: React.DragEvent, position: 'before' | 'after' | 'inside') => {
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

  // FIXED: Reorder documents with proper order calculation
  const reorderDocuments = (
    docs: Document[], 
    draggedId: string, 
    targetId: string, 
    position: 'before' | 'after' | 'inside',
    newParentId?: string
  ): Document[] => {
    const updatedDocs = [...docs];
    const draggedIndex = updatedDocs.findIndex(doc => doc.id === draggedId);
    const targetIndex = updatedDocs.findIndex(doc => doc.id === targetId);
    
    if (draggedIndex === -1 || targetIndex === -1) return docs;
    
    const draggedDoc = updatedDocs[draggedIndex];
    const targetDoc = updatedDocs[targetIndex];
    
    // Update parent if moving inside a folder
    if (position === 'inside') {
      draggedDoc.parentId = targetId;
      
      // Set order to be at the end of the new parent's children
      const siblings = updatedDocs.filter(doc => doc.parentId === targetId && doc.id !== draggedId);
      const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(doc => doc.order)) : 0;
      draggedDoc.order = maxOrder + 1000;
      
    } else {
      // Moving before/after - same parent as target
      draggedDoc.parentId = targetDoc.parentId;
      
      // Get all siblings (including the moved document)
      const siblings = updatedDocs
        .filter(doc => doc.parentId === targetDoc.parentId)
        .sort((a, b) => a.order - b.order);
      
      // Remove the dragged document from siblings to avoid duplicates
      const siblingsWithoutDragged = siblings.filter(doc => doc.id !== draggedId);
      
      // Find where to insert in the sorted list
      const targetIndexInSiblings = siblingsWithoutDragged.findIndex(doc => doc.id === targetId);
      const insertIndex = position === 'before' ? targetIndexInSiblings : targetIndexInSiblings + 1;
      
      // Reorder all siblings
      siblingsWithoutDragged.splice(insertIndex, 0, draggedDoc);
      
      // Reassign order values with gaps
      siblingsWithoutDragged.forEach((doc, index) => {
        doc.order = (index + 1) * 1000; // Use large gaps for future insertions
      });
    }
    
    return updatedDocs;
  };

  // ENHANCED: Handle drop with proper ordering and backend persistence
  const handleDrop = async (e: React.DragEvent, targetDoc: Document, position: 'before' | 'after' | 'inside') => {
    e.preventDefault();
    
    if (!draggedDocument || draggedDocument.id === targetDoc.id || isMoving) {
      setDraggedDocument(null);
      return;
    }

    // Validate the drop
    if (position === 'inside') {
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
    }

    // Store original state for rollback
    const originalDocs = [...projectDocs];
    
    // Calculate new order and parent
    const updatedDocs = reorderDocuments(
      projectDocs,
      draggedDocument.id,
      targetDoc.id,
      position
    );
    
    const updatedDraggedDoc = updatedDocs.find(doc => doc.id === draggedDocument.id);
    if (!updatedDraggedDoc) {
      console.error('Failed to find updated dragged document');
      return;
    }
    
    // Optimistically update UI
    setProjectDocs(updatedDocs);
    
    // Expand target folder if moving inside
    if (position === 'inside') {
      setExpandedNodes(prev => {
        if (!prev.includes(targetDoc.id)) {
          return [...prev, targetDoc.id];
        }
        return prev;
      });
    }

    // Persist to backend
    setIsMoving(true);
    try {
      await documents.move(draggedDocument.id, {
        newParentId: updatedDraggedDoc.parentId,
        newOrder: updatedDraggedDoc.order
      });
      
      console.log(`✅ Successfully moved "${draggedDocument.title}" with new order ${updatedDraggedDoc.order}`);
    } catch (error) {
      console.error('❌ Failed to move document on backend:', error);
      
      // Rollback the UI change on error
      setProjectDocs(originalDocs);
      
      // Show user-friendly error message
      alert(`Failed to move "${draggedDocument.title}". The change has been reverted.`);
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
      let parentId: string;
      let newOrder = Date.now(); // Default order
      
      if (selectedDocument) {
        if (['folder', 'chapter', 'part'].includes(selectedDocument.documentType)) {
          parentId = selectedDocument.id;
          // Set order to be at the end of this parent's children
          const siblings = projectDocs.filter(doc => doc.parentId === parentId);
          newOrder = siblings.length > 0 ? Math.max(...siblings.map(doc => doc.order)) + 1000 : 1000;
        } else {
          if (selectedDocument.parentId) {
            parentId = selectedDocument.parentId;
            // Insert after the selected document
            newOrder = selectedDocument.order + 500;
          } else {
            parentId = getDefaultParentForType(newDocType);
            const siblings = projectDocs.filter(doc => doc.parentId === parentId);
            newOrder = siblings.length > 0 ? Math.max(...siblings.map(doc => doc.order)) + 1000 : 1000;
          }
        }
      } else {
        parentId = getDefaultParentForType(newDocType);
        const siblings = projectDocs.filter(doc => doc.parentId === parentId);
        newOrder = siblings.length > 0 ? Math.max(...siblings.map(doc => doc.order)) + 1000 : 1000;
      }

      const response = await documents.create({
        title: newDocTitle,
        documentType: newDocType,
        parentId: parentId,
        projectId: project._id,
        order: newOrder
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
      
      console.log(`Created ${newDocType} "${newDocTitle}" with order ${newOrder}`);
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
            {isMoving && <span className="move-indicator"> | Reordering documents...</span>}
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
                  <li>• <strong>Drag & Drop:</strong> Drag documents to reorder or move between folders</li>
                  <li>• <strong>Smart Ordering:</strong> Documents maintain custom order for manuscript compilation</li>
                  <li>• <strong>Precise Drops:</strong> Drop before, after, or inside folders</li>
                  <li>• <strong>Auto-Save:</strong> Changes are automatically saved to Google Drive</li>
                  {isMoving && <li>• <strong>Reordering...</strong> Document move in progress</li>}
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