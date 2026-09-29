'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

function formatChatTitle(title) {
  if (!title) return 'New Security Chat';
  if (typeof title === 'string') return title;
  if (typeof title === 'object') {
    if (typeof title.text === 'string') return title.text.slice(0, 36);
    if (Array.isArray(title)) {
      const textObj = title.find((item) => item && (item.text || typeof item === 'string'));
      if (textObj) return (textObj.text || String(textObj)).slice(0, 36);
    }
  }
  return String(title).slice(0, 36);
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
}) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredChats = chats.filter((c) =>
    formatChatTitle(c.title).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <aside className={`chat-sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Sidebar Header */}
      <div className="sidebar-header-new">
        <Link href="/" className="sidebar-brand" aria-label="GTIS home">
          <Image
            src="/logo.png"
            alt="GTIS"
            width={100}
            height={32}
            style={{ height: 'auto', width: 'auto', objectFit: 'contain' }}
            priority
          />
        </Link>
        <button
          onClick={onNewChat}
          className="sidebar-new-btn"
          title="Start New Security Chat"
        >
          <span style={{ fontSize: '15px', fontWeight: 'bold' }}>+</span> New Chat
        </button>
      </div>

      {/* Search Bar */}
      <div className="sidebar-search-container">
        <div className="sidebar-search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="sidebar-search-input-field"
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Chat History List */}
      <div className="sidebar-history-container">
        <div className="sidebar-section-title">
          RECENT Chats ({filteredChats.length})
        </div>

        {filteredChats.length === 0 ? (
          <div className="sidebar-empty-state">
            No Chats found
          </div>
        ) : (
          <div className="sidebar-items-list">
            {filteredChats.map((chat) => (
              <div
                key={chat.id}
                className={`sidebar-chat-item ${chat.id === activeChatId ? 'active' : ''}`}
                onClick={() => onSelectChat(chat.id)}
              >
                <div className="chat-item-content">
                  <span className="chat-item-icon">💬</span>
                  <span className="chat-item-title">
                    {formatChatTitle(chat.title)}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteChat(chat.id);
                  }}
                  className="chat-item-delete-btn"
                  title="Delete Chat"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sidebar Footer with Clean User Badge & Fixed Logout Button */}
     <div className="sidebar-footer-new">
  <div className="sidebar-user-card">
    <div className="sidebar-user-avatar">
      {user?.email ? user.email.charAt(0).toUpperCase() : 'G'}
    </div>

    <div className="sidebar-user-meta">
      <span className="sidebar-user-email" title={user?.email || 'Guest User'}>
        {user?.name || user?.email || 'Guest User'}
      </span>
    </div>

    {onLogout && (
      <button
        onClick={onLogout}
        className="sidebar-logout-btn"
        title="Log out"
        aria-label="Log out"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
          <polyline points="16 17 21 12 16 7"></polyline>
          <line x1="21" y1="12" x2="9" y2="12"></line>
        </svg>
      </button>
    )}
  </div>
</div>
    </aside>
  );
}
