'use client';

import { useState } from 'react';

export default function ChatMessage({ message, user, onRegenerate, onCopy }) {
  const [copiedCodeIndex, setCopiedCodeIndex] = useState(null);
  const [copiedText, setCopiedText] = useState(false);
  const [thoughtOpen, setThoughtOpen] = useState(false);

  const isUser = message.role === 'user';

  const copyToClipboard = (text, isCode = false, index = null) => {
    navigator.clipboard.writeText(text);
    if (isCode) {
      setCopiedCodeIndex(index);
      setTimeout(() => setCopiedCodeIndex(null), 2000);
    } else {
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
      if (onCopy) onCopy(text);
    }
  };

  const renderFormattedContent = (rawContent) => {
    if (!rawContent) return null;

    let content = rawContent;
    if (typeof content !== 'string') {
      if (Array.isArray(content)) {
        const textObj = content.find((item) => item && (item.text || typeof item === 'string'));
        content = textObj ? (textObj.text || String(textObj)) : JSON.stringify(content);
      } else if (typeof content === 'object') {
        content = content.text ? String(content.text) : JSON.stringify(content);
      } else {
        content = String(content);
      }
    }

    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    let index = 0;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          text: content.substring(lastIndex, match.index),
          key: `text-${index}`
        });
      }

      parts.push({
        type: 'code',
        lang: match[1] || 'code',
        code: match[2].trim(),
        key: `code-${index}`
      });

      lastIndex = match.index + match[0].length;
      index++;
    }

    if (lastIndex < content.length) {
      parts.push({
        type: 'text',
        text: content.substring(lastIndex),
        key: `text-${index}`
      });
    }

    return parts.map((part, i) => {
      if (part.type === 'code') {
        return (
          <div key={part.key} className="code-block-container">
            <div className="code-header">
              <span>{part.lang.toUpperCase()}</span>
              <button
                className="btn-copy-code"
                onClick={() => copyToClipboard(part.code, true, i)}
              >
                {copiedCodeIndex === i ? 'COPIED ✓' : 'COPY CODE'}
              </button>
            </div>
            <pre className="code-content">
              <code>{part.code}</code>
            </pre>
          </div>
        );
      }

      const lines = part.text.split('\n');
      return (
        <div key={part.key}>
          {lines.map((line, lIdx) => {
            if (line.startsWith('### ')) {
              return <h4 key={lIdx} style={{ fontSize: '18px', margin: '12px 0 6px', fontFamily: 'var(--font-serif)' }}>{line.replace('### ', '')}</h4>;
            }
            if (line.startsWith('#### ')) {
              return <h5 key={lIdx} style={{ fontSize: '16px', margin: '10px 0 4px', fontFamily: 'var(--font-mono)' }}>{line.replace('#### ', '')}</h5>;
            }
            if (line.startsWith('- ')) {
              return <li key={lIdx} style={{ marginLeft: '16px', marginBottom: '4px' }}>{line.replace('- ', '')}</li>;
            }
            return line ? <p key={lIdx} style={{ marginBottom: '8px' }}>{line}</p> : <br key={lIdx} />;
          })}
        </div>
      );
    });
  };

  return (
    <div className={`message-row ${isUser ? 'user' : 'assistant'}`}>
      <div className={`message-avatar ${isUser ? 'user' : 'assistant'}`}>
        {isUser ? (
          user?.avatar ? (
            <img
              src={user.avatar}
              alt={user.name || 'User'}
              style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            user?.name
              ? user.name.charAt(0).toUpperCase()
              : user?.email
              ? user.email.charAt(0).toUpperCase()
              : 'U'
          )
        ) : (
          'Z'
        )}
      </div>

      <div className="message-content-wrapper">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="message-role-label">
            {isUser ? (user?.name || 'YOU') : 'ZYRA • GTIS AI'}
          </span>
          {message.timestamp && (
            <span style={{ fontSize: '11px', color: 'var(--text-smoke)' }}>
              {message.timestamp}
            </span>
          )}
        </div>

        {/* Attached Files & Images Rendering */}
        {message.attachments && message.attachments.length > 0 && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
            {message.attachments.map((att, aIdx) => {
              // Convert Google Drive file ID to a direct image rendering URL
              const directDriveImgUrl = att.driveFileId ? `https://drive.google.com/thumbnail?id=${att.driveFileId}&sz=w800` : null;
              const fallbackImgUrl = att.driveFileId ? `https://drive.google.com/uc?export=view&id=${att.driveFileId}` : att.driveUrl;
              
              const imageSrc = att.dataUrl || directDriveImgUrl || fallbackImgUrl || null;
              
              return (
              <div key={aIdx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {att.isImage && imageSrc ? (
                  <a href={att.driveUrl || att.dataUrl} target="_blank" rel="noreferrer">
                    <img
                      src={imageSrc}
                      alt={att.name}
                      style={{
                        maxHeight: '180px',
                        maxWidth: '280px',
                        borderRadius: '12px',
                        border: '1px solid var(--border-ash)',
                        objectFit: 'cover'
                      }}
                    />
                  </a>
                ) : att.driveFileId ? (
                  <a
                    href={`https://drive.google.com/file/d/${att.driveFileId}/view`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 14px',
                      borderRadius: '10px',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-ash)',
                      color: 'var(--cta-lake-blue)',
                      textDecoration: 'none',
                      fontSize: '12px',
                      transition: 'background 0.2s',
                    }}
                  >
                    <span style={{ fontSize: '16px' }}>📄</span>
                    <span style={{ fontWeight: '500' }}>{att.name}</span>
                    {att.size && <span style={{ opacity: 0.6, fontSize: '11px' }}>({att.size})</span>}
                    <span style={{ marginLeft: 'auto', fontSize: '11px', opacity: 0.8 }}>Open ↗</span>
                  </a>
                ) : att.driveUrl ? (
                  <a
                    href={att.driveUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-pill)',
                      backgroundColor: 'var(--card-periwinkle)',
                      fontSize: '12px',
                      color: 'var(--cta-lake-blue)',
                      textDecoration: 'none',
                    }}
                  >
                    <span>📄</span>
                    <span>{att.name}</span>
                    <span style={{ opacity: 0.7, fontSize: '10px' }}>({att.size})</span>
                  </a>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-pill)',
                      backgroundColor: 'var(--card-periwinkle)',
                      fontSize: '12px',
                      color: 'var(--cta-lake-blue)',
                    }}
                  >
                    <span>📄</span>
                    <span>{att.name}</span>
                    <span style={{ opacity: 0.7, fontSize: '10px' }}>({att.size})</span>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}

        {!isUser && message.thought && (
          <div className="thought-accordion">
            <div className="thought-trigger" onClick={() => setThoughtOpen(!thoughtOpen)}>
              <span>{thoughtOpen ? '▼ Hide reasoning process' : '► Thinking process (GTIS Threat Matrix)'}</span>
            </div>
            {thoughtOpen && <div className="thought-body">{message.thought}</div>}
          </div>
        )}

        {!isUser && message.citations && message.citations.length > 0 && (
          <div style={{ marginBottom: '8px' }}>
            {message.citations.map((cite, cIdx) => (
              <a key={cIdx} href={cite.url || '#'} target="_blank" rel="noreferrer" className="citation-chip">
                🌐 {cite.title}
              </a>
            ))}
          </div>
        )}

        <div className="message-bubble">
          {renderFormattedContent(message.content)}
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <button
            onClick={() => copyToClipboard(message.content)}
            style={{ background: 'transparent', border: 'none', fontSize: '12px', color: 'var(--text-smoke)', cursor: 'pointer' }}
          >
            {copiedText ? 'COPIED ✓' : 'COPY'}
          </button>
          {!isUser && onRegenerate && (
            <button
              onClick={onRegenerate}
              style={{ background: 'transparent', border: 'none', fontSize: '12px', color: 'var(--text-smoke)', cursor: 'pointer' }}
            >
              REGENERATE
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
