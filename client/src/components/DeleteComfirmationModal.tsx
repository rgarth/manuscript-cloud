import React from 'react';
import './DeleteConfirmationModal.css';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  title: string;
  itemName: string;
  itemType: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
  children?: React.ReactNode;
}

const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  title,
  itemName,
  itemType,
  onConfirm,
  onCancel,
  isDeleting,
  children
}) => {
  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isDeleting) {
      onCancel();
    }
  };

  const handleConfirm = () => {
    if (!isDeleting) {
      onConfirm();
    }
  };

  const handleCancel = () => {
    if (!isDeleting) {
      onCancel();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content">
        <div className="modal-header">
          <h2>{title}</h2>
        </div>
        
        <div className="modal-body">
          <p>
            Are you sure you want to delete the {itemType} <strong>"{itemName}"</strong>?
          </p>
          
          {children}
          
          <div className="warning-text">
            <strong>Warning:</strong> This action cannot be undone. The {itemType} will be permanently deleted from both your local database and Google Drive.
          </div>
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
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <span className="spinner"></span>
                Deleting...
              </>
            ) : (
              `Delete ${itemType}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmationModal;