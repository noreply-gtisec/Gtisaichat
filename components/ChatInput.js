'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const DRAFT_KEY = 'gtis-draft';

export default function ChatInput({ onSendMessage, isStreaming, onStopStream }) {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadFileName, setUploadFileName] = useState('');
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  // Restore the draft text once on mount so a reload mid-typing keeps it (PART 3.5)
  useEffect(() => {
    try {
      const draft = window.sessionStorage.getItem(DRAFT_KEY);
      if (draft) setInput(draft);
    } catch {
      // sessionStorage unavailable — no draft restore, harmless
    }
  }, []);

  // Persist the draft as a small sessionStorage value (debounced via effect coalescing)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (input) window.sessionStorage.setItem(DRAFT_KEY, input);
        else window.sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        // ignore quota / private mode
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [input]);

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

  const uploadSingleFile = async (file, password = null) => {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};

    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isBinaryDoc = isPdf || file.name.toLowerCase().endsWith('.doc') || file.name.toLowerCase().endsWith('.docx');

    let dataUrl = null;
    let textContent = null;
    let pageCount = null;
    let documentChunks = [];

    if (isImage) {
      dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.readAsDataURL(file);
      });
    } else if (!isBinaryDoc) {
      textContent = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.readAsText(file);
      });
    }

    let driveUrl = null;
    let driveFileId = null;
    let uploadError = null;
    let errorCode = null;

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (password) formData.append('password', password);

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
          if (data.file) {
            driveUrl = data.file.fileUrl || data.file.downloadUrl;
            driveFileId = data.file.driveFileId;
          }
          if ((isPdf || isBinaryDoc) && data.extractedText) {
            textContent = data.extractedText;
            pageCount = data.pageCount || null;
          }
          if (data.chunks && data.chunks.length > 0) {
            documentChunks = data.chunks;
          }
        } else {
          uploadError = data.error || 'Upload failed on server';
          errorCode = data.code || null;
        }
      } else {
        uploadError = `Upload failed (HTTP ${res.status})`;
        try {
          const errData = await res.json();
          if (errData.error) uploadError = errData.error;
          if (errData.code) errorCode = errData.code;
        } catch { /* non-JSON response */ }
      }
    } catch (err) {
      uploadError = err.name === 'AbortError' ? 'Upload timed out after 120s' : `Upload error: ${err.message}`;
      console.warn('File upload warning:', err.message);
    }

    return {
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
      errorCode,
      chunks: documentChunks,
      originalFile: file
    };
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);

    for (const file of files) {
      setUploadFileName(file.name);

      const result = await uploadSingleFile(file);

      if (result.uploadError) {
        console.warn(`Upload issue for ${file.name}:`, result.uploadError);
      }

      setAttachments((prev) => [
        ...prev,
        {
          id: `att-${Date.now()}-${Math.random()}`,
          ...result
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

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || isStreaming || uploading) return;

    const passwordNeededAtts = attachments.filter(a => a.errorCode === 'PASSWORD_REQUIRED' || a.errorCode === 'WRONG_PASSWORD');
    let finalAttachments = [...attachments];
    let passwordUsedForUnlock = false;
    let matchedPassword = null;

    // Use the main chat input as the password if there are locked attachments
    if (passwordNeededAtts.length > 0 && input.trim()) {
      setUploading(true);

      const fullInput = input.trim();
      const firstWord = fullInput.split(/\s+/)[0];
      // Try the entire input first, then try just the first word
      const possiblePasswords = [...new Set([fullInput, firstWord])];

      for (let i = 0; i < finalAttachments.length; i++) {
        const att = finalAttachments[i];
        if ((att.errorCode === 'PASSWORD_REQUIRED' || att.errorCode === 'WRONG_PASSWORD') && att.originalFile) {
          setUploadFileName(`Unlocking ${att.name}...`);

          let retryResult;
          for (const pwd of possiblePasswords) {
            retryResult = await uploadSingleFile(att.originalFile, pwd);
            if (!retryResult.uploadError || retryResult.errorCode !== 'WRONG_PASSWORD') {
              matchedPassword = pwd;
              break;
            }
          }

          if (!retryResult.uploadError || retryResult.errorCode !== 'WRONG_PASSWORD') {
            finalAttachments[i] = {
              ...att,
              ...retryResult,
              id: att.id
            };
            if (!retryResult.uploadError) {
              passwordUsedForUnlock = true;
            }
          } else {
            // Keep the error so user knows they entered the wrong password
            finalAttachments[i].uploadError = retryResult.uploadError;
            finalAttachments[i].errorCode = retryResult.errorCode;
          }
        }
      }
      setAttachments(finalAttachments);
      setUploading(false);
      setUploadFileName('');

      // If any attachment still needs a password, abort sending so they can try again
      const stillNeedsPassword = finalAttachments.some(a => a.errorCode === 'PASSWORD_REQUIRED' || a.errorCode === 'WRONG_PASSWORD');
      if (stillNeedsPassword) {
        return; // Don't send, wait for correct password
      }
    }

    // Only send the message text if we have anything to say, or if the user is just providing a password
    let textToSend = input.trim();

    if (passwordUsedForUnlock) {
      if (textToSend === matchedPassword) {
        textToSend = "I've unlocked the document.";
      } else if (textToSend.startsWith(matchedPassword + ' ') || textToSend.startsWith(matchedPassword + '\n')) {
        // Strip the password from the beginning of the prompt
        textToSend = textToSend.slice(matchedPassword.length).trim();
        // They might have typed something like "password and do this". Let's clean up leading "and" if they did that.
        if (textToSend.toLowerCase().startsWith('and ')) {
          textToSend = textToSend.slice(4).trim();
        }
      }
    }

    onSendMessage(textToSend, finalAttachments);
    setInput('');
    setAttachments([]);
    try {
      window.sessionStorage.removeItem(DRAFT_KEY);
    } catch { /* ignore */ }
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
                {uploadFileName.startsWith('Unlocking') ? uploadFileName : `Uploading ${uploadFileName}...`}
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
                  <span title={att.uploadError}>{att.errorCode === 'PASSWORD_REQUIRED' || att.errorCode === 'WRONG_PASSWORD' ? '🔒' : '⚠️'}</span>
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

        {attachments.some(a => a.uploadError) && (
          <div style={{ padding: '8px 16px', color: '#e74c3c', fontSize: '13px', backgroundColor: 'rgba(231, 76, 60, 0.1)', borderBottom: '1px solid rgba(231, 76, 60, 0.2)' }}>
            <strong>Error:</strong> {attachments.find(a => a.uploadError).uploadError}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Zyra anything... (or enter password for locked files)"
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
              accept="image/png,image/jpeg,image/webp,.pdf,.doc,.docx"
              style={{ display: 'none' }}
            />

            <button
              type="button"
              className="chip-toggle"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Attach File or Image"
            >
              {uploading && !uploadFileName.startsWith('Unlocking') ? '⏳ Processing...' : '📎 Attach File'}
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

