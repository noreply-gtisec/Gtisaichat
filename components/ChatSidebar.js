'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

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
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <aside className={`chat-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <Link href="/" className="brand-wordmark" aria-label="GTIS home">
  <Image
    src="/logo.png"
    alt="GTIS"
    width={100}
    height={50}
    priority
  />
</Link>
        <button
          onClick={onNewChat}
          className="btn-new-chat"
        >
          + NEW CHAT
        </button>
      </div>

      <div className="sidebar-search">
        <input
          type="text"
          placeholder="Search chat history..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="sidebar-search-input"
        />
      </div>

      <div className="sidebar-history-list">
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
                💬 {chat.title}
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
        {user && (
          <div className="user-profile-badge" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="user-avatar">{user.name.charAt(0)}</span>
              <span style={{ fontSize: '12px' }}>{user.name}</span>
            </div>
            <button onClick={onLogout} className="btn-logout">
              LOGOUT
            </button>
          </div>
        )}

        
      </div>
    </aside>
  );
}
