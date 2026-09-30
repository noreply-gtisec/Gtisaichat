'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function ChatInput({ onSendMessage, isStreaming, onStopStream }) {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadFileName, setUploadFileName] = useState('');
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    
    // Get auth token for secure upload
    const { data: { session } } = await supabase.auth.getSession();
    const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};

    for (const file of files) {
      setUploadFileName(file.name);
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const isBinaryDoc = isPdf || file.name.toLowerCase().endsWith('.doc') || file.name.toLowerCase().endsWith('.docx');
      let dataUrl = null;
      let textContent = null;
      let pageCount = null;

      if (isImage) {
        // Read image as base64 data URL for preview and multimodal API
        dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target.result);
          reader.readAsDataURL(file);
        });
      } else if (!isBinaryDoc) {
        // Only readAsText for actual text-based files (.txt, .csv, .json, .py, .js, etc.)
        // PDFs and .doc/.docx are binary — readAsText produces garbage
        textContent = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target.result);
          reader.readAsText(file);
        });
      }

      let driveUrl = null;
      let driveFileId = null;
      let uploadError = null;

      // Upload to server — handles Google Drive upload + PDF text extraction
      try {
        const formData = new FormData();
        formData.append('file', file);

        // Abort on the client too so the UI never hangs forever
        const controller = new AbortController();
        const abortTimer = setTimeout(() => controller.abort(), 120000);

        const res = await fetch('/api/upload', {
          method: 'POST',
          headers,
          body: formData,
          signal: controller.signal,
        }).finally(() => clearTimeout(abortTimer));

        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            // Pick up Google Drive info if available
            if (data.file) {
              driveUrl = data.file.fileUrl || data.file.downloadUrl;
              driveFileId = data.file.driveFileId;
            }
            // Use server-extracted text for PDFs (clean text from pdf-parse)
            if (isPdf && data.extractedText) {
              textContent = data.extractedText;
              pageCount = data.pageCount || null;
            }
          } else {
            uploadError = data.error || 'Upload failed on server';
          }
        } else {
          uploadError = `Upload failed (HTTP ${res.status})`;
          try {
            const errData = await res.json();
            if (errData.error) uploadError = errData.error;
          } catch { /* non-JSON response */ }
        }
      } catch (err) {
        uploadError = err.name === 'AbortError' ? 'Upload timed out after 120s' : `Upload error: ${err.message}`;
        console.warn('File upload warning:', err.message);
      }

      if (uploadError) {
        console.warn(`Upload issue for ${file.name}:`, uploadError);
      }

      setAttachments((prev) => [
        ...prev,
        {
          id: `att-${Date.now()}-${Math.random()}`,
          name: file.name,
          size: (file.size / 1024).toFixed(1) + ' KB',
          type: file.type,
          isImage,
          isPdf,
          dataUrl,
          textContent,
          pageCount,
          driveUrl,
          driveFileId,
          uploadError,
        },
      ]);
    }

    setUploading(false);
    setUploadFileName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = (id) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSend = () => {
    if ((!input.trim() && attachments.length === 0) || isStreaming || uploading) return;
    onSendMessage(input.trim(), attachments);
    setInput('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const canSend = (input.trim().length > 0 || attachments.length > 0) && !isStreaming && !uploading;

  return (
    <div className="chat-input-wrapper">
      <div className="chat-input-card">
        {/* Uploading progress indicator */}
        {uploading && (
          <div className="file-upload-indicator">
            <div className="file-upload-indicator-inner">
              <span className="file-upload-spinner" />
              <span className="file-upload-text">
                Uploading <strong>{uploadFileName}</strong>...
              </span>
            </div>
            <div className="file-upload-progress-bar">
              <div className="file-upload-progress-fill" />
            </div>
          </div>
        )}

        {attachments.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingBottom: '8px', borderBottom: '1px dashed var(--border-ash)' }}>
            {attachments.map((att) => (
              <div
                key={att.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-pill)',
                  backgroundColor: 'var(--card-periwinkle)',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--cta-lake-blue)',
                }}
              >
                {att.uploadError ? (
                  <span title={att.uploadError}>⚠️</span>
                ) : att.isImage ? (
                  <img
                    src={att.dataUrl}
                    alt={att.name}
                    style={{ width: '20px', height: '20px', borderRadius: '4px', objectFit: 'cover' }}
                  />
                ) : att.isPdf ? (
                  <span>📕</span>
                ) : (
                  <span>📄</span>
                )}
                <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {att.name}
                </span>
                <span style={{ fontSize: '10px', opacity: 0.7 }}>
                  ({att.size}{att.pageCount ? ` · ${att.pageCount} pg` : ''})
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveAttachment(att.id)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '12px', marginLeft: '4px' }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Zyra anything about cybersecurity, threats, compliance, or zero-trust..."
          className="chat-textarea"
          rows={1}
          disabled={isStreaming}
        />

        <div className="chat-input-toolbar">
          <div className="toolbar-tools">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              multiple
              accept="image/*,.pdf,.doc,.docx,.txt,.csv,.json,.py,.js,.html,.css"
              style={{ display: 'none' }}
            />

            <button
              type="button"
              className="chip-toggle"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Attach File or Image"
            >
              {uploading ? '⏳ Processing...' : '📎 Attach File / Image'}
            </button>

            <span style={{ fontSize: '11px', color: 'var(--text-smoke)' }}>
              Press Enter to send
            </span>
          </div>

          <div>
            {isStreaming ? (
              <button
                type="button"
                onClick={onStopStream}
                className="btn-send-message"
                style={{ backgroundColor: '#e74c3c' }}
                title="Stop Response"
              >
                ■
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                className="btn-send-message"
                title="Send Message"
              >
                ▲
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
