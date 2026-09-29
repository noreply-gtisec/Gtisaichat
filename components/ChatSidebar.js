'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

function formatChatTitle(title) {
  if (!title) return 'New Audit';
  if (typeof title === 'string') return title;
  if (typeof title === 'object') {
    if (typeof title.text === 'string') return title.text.slice(0, 40);
    if (Array.isArray(title)) {
      const textObj = title.find((item) => item && (item.text || typeof item === 'string'));
      if (textObj) return (textObj.text || String(textObj)).slice(0, 40);
    }
  }
  return String(title).slice(0, 40);
}

export default function ChatSidebar({
  collapsed,
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  user,
  onLogout,
  onBackToLanding
}) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredChats = chats.filter((c) =>
    formatChatTitle(c.title).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <aside className={`chat-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <Link href="/" className="brand-wordmark" aria-label="GTIS home">
          <Image
            src="/logo.png"
            alt="GTIS"
            width={120}
            height={36}
            style={{ height: 'auto', width: 'auto', objectFit: 'contain' }}
            priority
          />
        </Link>
        <button
          onClick={onNewChat}
          className="btn btn-primary"
          style={{ padding: '6px 12px', fontSize: '12px' }}
        >
          + New Audit
        </button>
      </div>

      <div className="sidebar-search">
        <input
          type="text"
          placeholder="Search audits..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input-field"
          style={{ padding: '6px 10px', fontSize: '12px' }}
        />
      </div>

      <div className="sidebar-history">
        <span className="mono-small" style={{ fontSize: '11px', color: 'var(--text-smoke)', padding: '6px 4px 2px' }}>
          RECENT CONVERSATIONS
        </span>
        {filteredChats.length === 0 ? (
          <div style={{ padding: '12px 4px', fontSize: '12px', color: 'var(--text-smoke)' }}>
            No chat history found.
          </div>
        ) : (
          filteredChats.map((chat) => (
            <div
              key={chat.id}
              className={`history-item ${chat.id === activeChatId ? 'active' : ''}`}
              onClick={() => onSelectChat(chat.id)}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                💬 {formatChatTitle(chat.title)}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteChat(chat.id);
                }}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-smoke)', cursor: 'pointer', fontSize: '12px' }}
                title="Delete Chat"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      <div className="sidebar-footer">
        <div className="user-profile">
          <div className="avatar">
            {user?.email ? user.email.charAt(0).toUpperCase() : 'G'}
          </div>
          <div className="user-info">
            <span className="user-name">{user?.name || user?.email || 'Guest User'}</span>
            <span className="user-role">{user?.role || 'Cyber Analyst'}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          {onBackToLanding && (
            <button onClick={onBackToLanding} className="btn btn-ghost" style={{ flex: 1, fontSize: '11px', padding: '4px' }}>
              Home
            </button>
          )}
          {onLogout && (
            <button onClick={onLogout} className="btn btn-ghost" style={{ flex: 1, fontSize: '11px', padding: '4px', color: '#ff4d4f' }}>
              Logout
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
