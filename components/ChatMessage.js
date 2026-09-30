'use client';

import { useState, memo, useMemo, Component } from 'react';
import { getText } from '../lib/history';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// UI-side cap for very long messages — rest hidden behind "Show more"
const MAX_DISPLAY_CHARS = 20000;

// Catch-all boundary so one malformed message can never crash the whole chat
function MessageErrorBoundaryFallback() {
  return (
    <div style={{ padding: '10px 14px', margin: '6px 0', borderRadius: '10px', background: 'rgba(231, 76, 60, 0.08)', border: '1px solid rgba(231, 76, 60, 0.35)', color: 'var(--text-smoke)', fontSize: '13px' }}>
      This message could not be displayed.
    </div>
  );
}

class MessageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? <MessageErrorBoundaryFallback /> : this.props.children;
  }
}

function SearchingLoader() {
  return (
    <div className="simple-searching-loader">
      <span className="simple-spinner" aria-hidden="true" />
      <span>Searching...</span>
    </div>
  );
}

function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="code-block-container">
      <div className="code-header">
        <span className="code-lang">{(language || 'code').toUpperCase()}</span>
        <button
          type="button"
          className="btn-copy-code"
          onClick={handleCopy}
          aria-label="Copy code to clipboard"
        >
          {copied ? 'Copied ✓' : 'Copy code'}
        </button>
      </div>
      <pre className="code-content">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function extractRawString(val) {
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val.map(extractRawString).join('');
  if (val && typeof val === 'object' && val.props && val.props.children) {
    return extractRawString(val.props.children);
  }
  return String(val || '');
}

const markdownComponents = {
  a({ node, href, children, ...props }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    );
  },
  pre({ children }) {
    return <>{children}</>;
  },
  code({ node, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '');
    const codeString = extractRawString(children).replace(/\n$/, '');
    const isBlock = Boolean(match) || (typeof children === 'string' && children.includes('\n'));

    if (isBlock) {
      return <CodeBlock language={match ? match[1] : 'code'} code={codeString} />;
    }

    return (
      <code className="inline-code" {...props}>
        {children}
      </code>
    );
  },
  table({ node, children, ...props }) {
    return (
      <div className="table-wrapper">
        <table {...props}>{children}</table>
      </div>
    );
  },
};

function ChatMessageBase({ message, user, isStreaming, onRegenerate, onCopy }) {
  const [copiedText, setCopiedText] = useState(false);
  const [thoughtOpen, setThoughtOpen] = useState(false);
  const [showFull, setShowFull] = useState(false);

  const isUser = message.role === 'user';

  // Safe flattening of content: string | [{type:'text'}] | {text} | null
  const rawText = useMemo(() => getText(message.content), [message.content]);
  const truncated = rawText.length > MAX_DISPLAY_CHARS;
  const displayText = truncated && !showFull ? rawText.slice(0, MAX_DISPLAY_CHARS) : rawText;

  // For user messages, display the clean user prompt instead of dumping thousands of lines of attached document text
  const displayPrompt = useMemo(() => {
    if (!isUser) return '';
    if (message.promptText) return message.promptText;
    const str = rawText;
    const docIdx = str.indexOf('\n\n[Attached ');
    if (docIdx !== -1) {
      const clean = str.slice(0, docIdx).trim();
      return clean || (message.attachments?.length > 0 ? '' : str);
    }
    return str;
  }, [isUser, message.promptText, rawText, message.attachments]);

  const copyToClipboard = (text) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
      if (onCopy) onCopy(text);
    }
  };

  return (
    <div className={`message-row ${isUser ? 'user' : 'assistant'}`}>
      <div className={`message-avatar ${isUser ? 'user' : 'assistant'}`}>
        {isUser ? (
          user?.name
            ? user.name.charAt(0).toUpperCase()
            : user?.email
            ? user.email.charAt(0).toUpperCase()
            : user?.avatar || 'U'
        ) : (
          'Z'
        )}
      </div>

      <div className="message-content-wrapper">
        <div className="message-header">
          <span className="message-role-label">
            {isUser ? (user?.name || 'YOU') : 'ZYRA • GTIS AI'}
          </span>
          {message.timestamp && (
            <span className="message-timestamp">
              {message.timestamp}
            </span>
          )}
        </div>

        {/* Attached Files & Images Rendering */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="message-attachments">
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
          {!isUser && rawText.trim() === '' ? (
            isStreaming ? (
              <SearchingLoader />
            ) : (
              <span style={{ color: 'var(--text-smoke)', fontStyle: 'italic', fontSize: '13px' }}>
                No response received. This reply was likely interrupted by a reload — use REGENERATE below.
              </span>
            )
          ) : (
            <>
              {isUser ? (
                displayPrompt ? (
                  <div className="user-message-text">{displayPrompt}</div>
                ) : null
              ) : (
                <div className="md">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}
                  >
                    {displayText}
                  </ReactMarkdown>
                </div>
              )}
              {truncated && !showFull && !isUser && (
                <button
                  onClick={() => setShowFull(true)}
                  style={{ background: 'transparent', border: 'none', fontSize: '12px', color: 'var(--cta-lake-blue)', cursor: 'pointer', fontWeight: '600', padding: '4px 0' }}
                >
                  Show more ({(rawText.length - MAX_DISPLAY_CHARS).toLocaleString()} more characters)
                </button>
              )}
              {truncated && showFull && !isUser && (
                <button
                  onClick={() => setShowFull(false)}
                  style={{ background: 'transparent', border: 'none', fontSize: '12px', color: 'var(--text-smoke)', cursor: 'pointer', padding: '4px 0' }}
                >
                  Show less
                </button>
              )}
              {isStreaming && !isUser && (
                <span className="streaming-cursor" title="Generating...">▍</span>
              )}
            </>
          )}
        </div>

        {(rawText.trim().length > 0 || (!isUser && !isStreaming && onRegenerate)) && (
          <div className="message-actions">
            {rawText.trim().length > 0 && (
              <button
                onClick={() => copyToClipboard(isUser ? (displayPrompt || rawText) : rawText)}
                className="btn-message-action"
              >
                {copiedText ? 'COPIED ✓' : 'COPY'}
              </button>
            )}
            {!isUser && onRegenerate && !isStreaming && (
              <button
                onClick={onRegenerate}
                className="btn-message-action"
              >
                REGENERATE
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Stable per-message error boundary: a crash in one message shows a fallback
// chip instead of taking down the entire interface (PART 3.6)
export default memo(function ChatMessage(props) {
  return (
    <MessageErrorBoundary>
      <ChatMessageBase {...props} />
    </MessageErrorBoundary>
  );
});
