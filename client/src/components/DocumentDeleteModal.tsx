import React, { useState, useEffect } from 'react';
import { documents } from '../services/api';
import './DeleteConfirmationModal.css';

interface Child {
  id: string;
  title: string;
  type: string;
}

interface CanDeleteResponse {
  canDelete: boolean;
  childCount: number;
  children: Child[];
  document: {
    id: string;
    title: string;
    type: string;
  };
}

interface DocumentDeleteModalProps {
  isOpen: boolean;
  documentId: string | null;
  documentName: string;
  documentType: string;
  onConfirm: (force?: boolean) => void;
  onCancel: () => void;
  isDeleting: boolean;
}

const DocumentDeleteModal: React.FC<DocumentDeleteModalProps> = ({
  isOpen,
  documentId,
  documentName,
  documentType,
  onConfirm,
  onCancel,
  isDeleting
}) => {
  const [canDeleteData, setCanDeleteData] = useState<CanDeleteResponse | null>(null);
  const [isLoadingCheck, setIsLoadingCheck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forceDelete, setForceDelete] = useState(false);

  useEffect(() => {
    if (isOpen && documentId) {
      checkCanDelete();
    } else {
      setCanDeleteData(null);
      setError(null);
      setForceDelete(false);
    }
  }, [isOpen, documentId]);

  const checkCanDelete = async () => {
    if (!documentId) return;
    
    setIsLoadingCheck(true);
    setError(null);
    
    try {
      const response = await documents.canDelete(documentId);
      setCanDeleteData(response.data);
    } catch (err) {
      console.error('Failed to check if document can be deleted:', err);
      setError('Failed to check deletion status');
    } finally {
      setIsLoadingCheck(false);
    }
  };

  const handleConfirm = () => {
    if (!isDeleting) {
      onConfirm(forceDelete);
    }
  };

  const handleCancel = () => {
    if (!isDeleting) {
      onCancel();
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isDeleting) {
      onCancel();
    }
  };

  if (!isOpen) return null;

  const getDocumentIcon = (type: string) => {
    const icons: Record<string, string> = {
      folder: '📁',
      part: '📚',
      chapter: '📖',
      scene: '🎬',
      character: '👤',
      setting: '🏞️',
      note: '📝',
      research: '🔬'
    };
    return icons[type] || '📄';
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content">
        <div className="modal-header">
          <h2>Delete {documentType}</h2>
        </div>
        
        <div className="modal-body">
          {isLoadingCheck ? (
            <div className="loading-indicator">
              <div className="spinner"></div>
              <p>Checking deletion requirements...</p>
            </div>
          ) : error ? (
            <div className="error-text">
              {error}
            </div>
          ) : canDeleteData ? (
            <>
              <p>
                Are you sure you want to delete the {documentType} <strong>"{documentName}"</strong>?
              </p>
              
              {!canDeleteData.canDelete && canDeleteData.childCount > 0 && (
                <div className="folder-warning">
                  <p><strong>This {documentType} contains {canDeleteData.childCount} item(s):</strong></p>
                  <ul className="children-list">
                    {canDeleteData.children.map(child => (
                      <li key={child.id}>
                        <span className="document-icon">{getDocumentIcon(child.type)}</span>
                        <span className="document-title">{child.title}</span>
                        <span className={`doc-type-badge ${child.type}`}>{child.type}</span>
                      </li>
                    ))}
                  </ul>
                  <p>You cannot delete a non-empty {documentType} unless you choose to force delete it.</p>
                  
                  <div className="force-delete-option">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={forceDelete}
                        onChange={(e) => setForceDelete(e.target.checked)}
                        disabled={isDeleting}
                      />
                      Force delete this {documentType} and all its contents
                    </label>
                  </div>
                </div>
              )}
              
              <div className="warning-text">
                <strong>Warning:</strong> This action cannot be undone. The {documentType} 
                {forceDelete && canDeleteData.childCount > 0 && ` and all ${canDeleteData.childCount} item(s) inside it`} 
                will be permanently deleted from both your local database and Google Drive.
              </div>
            </>
          ) : (
            <p>Loading...</p>
          )}
        </div>
        
        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleCancel}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={handleConfirm}
            disabled={
              isDeleting || 
              isLoadingCheck || 
              error !== null ||
              (canDeleteData && !canDeleteData.canDelete && !forceDelete)
            }
          >
            {isDeleting ? (
              <>
                <span className="spinner"></span>
                Deleting...
              </>
            ) : forceDelete && canDeleteData && canDeleteData.childCount > 0 ? (
              `Force Delete ${documentType} & Contents`
            ) : (
              `Delete ${documentType}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DocumentDeleteModal;