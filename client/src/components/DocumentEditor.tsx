import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Editor } from '@tinymce/tinymce-react';
import { documents } from '../services/api';
import './DocumentEditor.css';

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
  console.log('🎨 DocumentEditor rendering for:', document.title);
  console.log('🔑 TinyMCE API Key from env:', process.env.REACT_APP_TINYMCE_API_KEY);
  
  const apiKey = process.env.REACT_APP_TINYMCE_API_KEY;
  const editorRef = useRef<any>(null);
  
  if (!apiKey) {
    console.error('❌ TinyMCE API key not found in environment variables!');
  }
  
  const [content, setContent] = useState(document.content || '');
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1.33); // Default 133% zoom

  // Update zoom in editor
  const handleZoomChange = (newZoom: number) => {
    setZoomLevel(newZoom);
    if (editorRef.current) {
      const editorBody = editorRef.current.getBody();
      if (editorBody) {
        editorBody.style.zoom = newZoom.toString();
      }
    }
  };

  // Get word count from TinyMCE's built-in wordcount plugin
  const getWordCountFromEditor = useCallback(() => {
    if (editorRef.current) {
      const editor = editorRef.current;
      // Use TinyMCE's wordcount plugin API
      if (editor.plugins && editor.plugins.wordcount) {
        return editor.plugins.wordcount.body.getWordCount();
      }
    }
    // Fallback calculation if plugin not available
    const text = content.replace(/<[^>]*>/g, '').trim();
    return text ? text.split(/\s+/).length : 0;
  }, [content]);

  // Update word count whenever content changes
  useEffect(() => {
    const words = getWordCountFromEditor();
    setWordCount(words);
  }, [content, getWordCountFromEditor]);

  // Memoize handleSave to prevent recreation on every render
  const handleSave = useCallback(async () => {
    if (!hasUnsavedChanges) return;
    
    setIsSaving(true);
    try {
      // Get word count from TinyMCE's built-in wordcount plugin
      const words = getWordCountFromEditor();
      
      console.log('💾 Saving document with content length:', content.length);
      console.log('📊 Word count from TinyMCE:', words);
      
      const response = await documents.update(document._id, { 
        content,
        metadata: {
          wordCount: words
        }
      });
      
      console.log('✅ Save response:', response);
      setHasUnsavedChanges(false);
      onSave?.(content);
      console.log('Document saved successfully with word count:', words);
    } catch (error) {
      console.error('Failed to save document:', error);
    } finally {
      setIsSaving(false);
    }
  }, [document._id, content, hasUnsavedChanges, onSave, getWordCountFromEditor]);

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
    
    // Update word count immediately when content changes
    setTimeout(() => {
      const words = getWordCountFromEditor();
      setWordCount(words);
    }, 10); // Small delay to ensure editor is updated
  };

  return (
    <div className="document-editor-overlay">
      <div className="document-editor focus-mode">
        <div className="editor-header">
          <div className="editor-title">
            <h2>📝 {document.title}</h2>
            <div className="editor-stats">
              <span>Words: {wordCount}</span>
              <span>Zoom: {Math.round(zoomLevel * 100)}%</span>
              {hasUnsavedChanges && <span className="unsaved">• Unsaved changes</span>}
              {isSaving && <span className="saving">• Saving...</span>}
            </div>
          </div>
          <div className="editor-actions">
            <div className="zoom-controls">
              <button
                onClick={() => handleZoomChange(1.0)}
                className={`btn btn-small ${zoomLevel === 1.0 ? 'active' : ''}`}
                title="100% zoom"
              >
                100%
              </button>
              <button
                onClick={() => handleZoomChange(1.25)}
                className={`btn btn-small ${zoomLevel === 1.25 ? 'active' : ''}`}
                title="125% zoom"
              >
                125%
              </button>
              <button
                onClick={() => handleZoomChange(1.33)}
                className={`btn btn-small ${zoomLevel === 1.33 ? 'active' : ''}`}
                title="133% zoom (recommended)"
              >
                133%
              </button>
              <button
                onClick={() => handleZoomChange(1.5)}
                className={`btn btn-small ${zoomLevel === 1.5 ? 'active' : ''}`}
                title="150% zoom"
              >
                150%
              </button>
              <button
                onClick={() => handleZoomChange(2.0)}
                className={`btn btn-small ${zoomLevel === 2.0 ? 'active' : ''}`}
                title="200% zoom"
              >
                200%
              </button>
            </div>
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
            apiKey={apiKey}
            value={content}
            onEditorChange={handleEditorChange}
            onInit={(evt, editor) => {
              editorRef.current = editor;
            }}
            init={{
              height: 500,
              menubar: false,
              plugins: [
                'advlist', 'autolink', 'lists', 'link', 'charmap', 'preview',
                'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
                'insertdatetime', 'table', 'help', 'wordcount'
              ],
              toolbar: 'undo redo | blocks | fontfamily fontsize | ' +
                'bold italic | alignleft aligncenter ' +
                'alignright alignjustify | bullist numlist | ' +
                'removeformat | help',
              font_family_formats: 'Times New Roman=times new roman,times,serif; Georgia=georgia,serif; Arial=arial,helvetica,sans-serif; Courier New=courier new,courier,monospace',
              font_size_formats: '8px 9px 10px 11px 12px 14px 16px 18px 20px 24px 36px 48px',
              content_style: `
                body { 
                  font-family: 'Times New Roman', 'Crimson Text', Georgia, serif; 
                  font-size: 12px; 
                  padding: 40px; 
                  line-height: 1.5; 
                  text-align: justify;
                  max-width: 700px;
                  margin: 0 auto;
                  color: #2c1810;
                  background: #ffffff;
                  zoom: 1.33; /* 133% zoom for better readability on high-DPI screens */
                }
                p {
                  margin-bottom: 16px;
                  text-align: justify;
                  line-height: 1.5;
                  text-indent: 1.5em;
                }
                /* Remove indent for first paragraph and after headings */
                p:first-child,
                h1 + p, h2 + p, h3 + p, h4 + p, h5 + p, h6 + p {
                  text-indent: 0;
                }
              `,
              placeholder: 'Start writing your content here...',
              skin: 'oxide',
              content_css: 'default',
              setup: (editor: any) => {
                editor.on('init', () => {
                  // Set default format when editor loads
                  editor.execCommand('JustifyFull');
                  // Set default font family and size (12px for manuscript standard)
                  editor.execCommand('FontName', false, 'Times New Roman');
                  editor.execCommand('FontSize', false, '12px');
                });
              }
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default DocumentEditor;