'use client';

import { useState, useRef, useEffect } from 'react';

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

    for (const file of files) {
      setUploadFileName(file.name);
      const isImage = file.type.startsWith('image/');
      let dataUrl = null;
      let textContent = null;

      if (isImage) {
        dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target.result);
          reader.readAsDataURL(file);
        });
      } else {
        textContent = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target.result);
          reader.readAsText(file);
        });
      }

      let driveUrl = null;
      let driveFileId = null;

      // Upload to Google Drive in the background
      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && data.file) {
            driveUrl = data.file.fileUrl || data.file.downloadUrl;
            driveFileId = data.file.driveFileId;
          }
        }
      } catch (err) {
        console.warn('Google Drive background upload warning:', err.message);
      }

      setAttachments((prev) => [
        ...prev,
        {
          id: `att-${Date.now()}-${Math.random()}`,
          name: file.name,
          size: (file.size / 1024).toFixed(1) + ' KB',
          type: file.type,
          isImage,
          dataUrl,
          textContent,
          driveUrl,
          driveFileId,
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
                {att.isImage ? (
                  <img
                    src={att.dataUrl}
                    alt={att.name}
                    style={{ width: '20px', height: '20px', borderRadius: '4px', objectFit: 'cover' }}
                  />
                ) : (
                  <span>📄</span>
                )}
                <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {att.name}
                </span>
                <span style={{ fontSize: '10px', opacity: 0.7 }}>({att.size})</span>
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
          placeholder="Ask GTIS AI cybersecurity engine... (Attach files or images below)"
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
