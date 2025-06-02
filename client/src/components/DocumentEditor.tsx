import React, { useState, useEffect, useCallback } from 'react';
import { Editor } from '@tinymce/tinymce-react';
import { documents } from '../services/api';

interface DocumentEditorProps {
  document: {
    _id: string;
    title: string;
    content: string;
    documentType: string;
  };
  onSave?: (content: string) => void;
  onClose?: () => void;
}

const DocumentEditor: React.FC<DocumentEditorProps> = ({
  document,
  onSave,
  onClose
}) => {
  const [content, setContent] = useState(document.content || '');
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [wordCount, setWordCount] = useState(0);

  // Memoize handleSave to prevent recreation on every render
  const handleSave = useCallback(async () => {
    if (!hasUnsavedChanges) return;
    
    setIsSaving(true);
    try {
      await documents.update(document._id, { content });
      setHasUnsavedChanges(false);
      onSave?.(content);
      console.log('Document saved successfully');
    } catch (error) {
      console.error('Failed to save document:', error);
    } finally {
      setIsSaving(false);
    }
  }, [document._id, content, hasUnsavedChanges, onSave]);

  // Auto-save every 30 seconds if there are unsaved changes
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    
    const autoSaveTimer = setTimeout(() => {
      handleSave();
    }, 30000);

    return () => clearTimeout(autoSaveTimer);
  }, [hasUnsavedChanges, handleSave]);

  // Save on Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };

    window.document.addEventListener('keydown', handleKeyDown);
    return () => window.document.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  const handleEditorChange = (newContent: string) => {
    setContent(newContent);
    setHasUnsavedChanges(true);
    
    // Update word count
    const text = newContent.replace(/<[^>]*>/g, '');
    const words = text.trim().split(/\s+/).length;
    setWordCount(words);
  };

  return (
    <div className="document-editor">
      <div className="editor-header">
        <div className="editor-title">
          <h2>📝 {document.title}</h2>
          <div className="editor-stats">
            <span>Words: {wordCount}</span>
            {hasUnsavedChanges && <span className="unsaved">• Unsaved changes</span>}
            {isSaving && <span className="saving">• Saving...</span>}
          </div>
        </div>
        <div className="editor-actions">
          <button
            onClick={handleSave}
            disabled={!hasUnsavedChanges || isSaving}
            className="btn btn-primary"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={onClose} className="btn btn-secondary">
            Close
          </button>
        </div>
      </div>
      
      <div className="editor-content">
        <Editor
          apiKey="your-tinymce-api-key" // You'll need to get this from TinyMCE
          value={content}
          onEditorChange={handleEditorChange}
          init={{
            height: 600,
            menubar: false,
            plugins: [
              'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
              'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
              'insertdatetime', 'media', 'table', 'code', 'help', 'wordcount'
            ],
            toolbar: 'undo redo | blocks | ' +
              'bold italic forecolor | alignleft aligncenter ' +
              'alignright alignjustify | bullist numlist outdent indent | ' +
              'removeformat | help',
            content_style: 'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 14px }'
          }}
        />
      </div>
    </div>
  );
};

export default DocumentEditor;