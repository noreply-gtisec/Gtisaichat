'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ChatSidebar from './ChatSidebar';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import EmptyState from './EmptyState';

import { supabase } from '../lib/supabaseClient';
import { getText } from '../lib/history';

// Small local cache only: 20 chats × 20 messages, text without attachments.
// The server is the source of truth — this just paints the sidebar instantly.
const CACHE_MAX_CHATS = 20;
const CACHE_MAX_MSGS = 20;
const ACTIVE_CHAT_KEY = 'gtis-active-chat';
const CHATS_CACHE_KEY = 'gtis-chats-cache';
const PAGE_SIZE = 20;

function safeReadLS(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // private mode / quota — ignore, server data still loads
  }
}

function safeWriteLS(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // QuotaExceededError etc. must never break the UI
  }
}

// Lightweight skeleton so the screen is never blank while loading (PART 3.2)
function MessageSkeleton() {
  return (
    <div className="message-skeleton" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton-row" style={{ flexDirection: i % 2 === 0 ? 'row' : 'row-reverse' }}>
          <div className="skeleton-avatar" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '70%' }}>
            <div className="skeleton-line" style={{ width: '60%' }} />
            <div className="skeleton-line" style={{ width: '90%' }} />
            <div className="skeleton-line" style={{ width: '75%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ChatInterface({ user, onLogout, onBackToLanding }) {
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('openai/gpt-6-luna-pro');
  const [isStreaming, setIsStreaming] = useState(false);
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [chatsError, setChatsError] = useState(null);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [earlierLoading, setEarlierLoading] = useState(false);
  const [hasMoreEarlier, setHasMoreEarlier] = useState(false);

  const messagesEndRef = useRef(null);
  const scrollRef = useRef(null);
  const abortControllerRef = useRef(null);
  const oldestCursorRef = useRef(null); // createdAt of the oldest loaded message
  const prependRestoreRef = useRef(null); // { height, top } captured before prepending older page
  const loadedChatRef = useRef(new Set()); // chatIds already loaded or loading


  // Fetch available models dynamically from OpenRouter backend catalog
  useEffect(() => {
    async function fetchModels() {
      try {
        const res = await fetch('/api/ai-models');
        if (res.ok) {
          const data = await res.json();
          if (data.models && data.models.length > 0) {
            setModels(data.models);
          }
        }
      } catch (err) {
        console.error('Failed to fetch OpenRouter models:', err);
      }
    }
    fetchModels();
  }, []);

  // Load chat threads from MongoDB on user load (server is the source of truth)
  const loadChatList = useCallback(async () => {
    setChatsLoading(true);
    setChatsError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};

      const res = await fetch('/api/chat-history', { headers });
      if (!res.ok) throw new Error(`Chat list request failed (HTTP ${res.status})`);
      const data = await res.json();

      // Instant sidebar paint from the small local cache for chats the server
      // hasn't returned (e. g. brand-new local chats keep their state)
      let cached = [];
      try {
        cached = JSON.parse(safeReadLS(CHATS_CACHE_KEY) || '[]');
      } catch {
        cached = [];
      }

      const serverChats = (data.chats || []).map((c) => ({
        id: c._id,
        title: typeof c.title === 'string' ? c.title : 'New Security Chat',
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        messages: [],
        loaded: false,
      }));
      const cachedOnly = cached.filter(
        (cc) => cc.id && !serverChats.some((sc) => sc.id === cc.id) && String(cc.id).startsWith('chat-')
      ).map((cc) => ({ ...cc, messages: cc.messages || [], loaded: false }));

      const merged = [...cachedOnly, ...serverChats];
      setChats(merged);

      // Reopen target: ?chatId= in the URL > last-active in localStorage > newest chat
      const urlChatId = new URLSearchParams(window.location.search).get('chatId');
      const storedChatId = safeReadLS(ACTIVE_CHAT_KEY);
      const target =
        merged.find((c) => c.id === urlChatId) ||
        merged.find((c) => c.id === storedChatId) ||
        merged[0] || null;
      setActiveChatId(target ? target.id : null);
    } catch (err) {
      console.error('Failed to load chats from MongoDB:', err);
      setChatsError(err.message);
    } finally {
      setChatsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) loadChatList();
  }, [user, loadChatList]);

  // Load one page of messages (newest 20) when a chat opens and has none yet.
  // A ref (not `chats`) tracks which chats are already loaded/loading, so this
  // effect depends only on activeChatId and cannot re-trigger itself (PART 2.6).
  useEffect(() => {
    if (!activeChatId) return;
    if (loadedChatRef.current.has(activeChatId)) return;
    loadedChatRef.current.add(activeChatId);

    let cancelled = false;

    async function loadChatMessages() {
      setMsgsLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const headers = session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {};

        const res = await fetch(`/api/chat-history?chatId=${encodeURIComponent(activeChatId)}`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;

        // Server returns newest-first; display oldest-to-newest
        const loaded = (data.messages || []).map((m) => ({
          id: m._id,
          role: m.role,
          content: m.content,
          attachments: m.attachments || [],
          timestamp: m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
        })).reverse();

        // If the saved thread ends on a user message, the reply was interrupted
        // (page closed mid-stream). Show an empty assistant bubble with Regenerate.
        if (loaded.length > 0 && loaded[loaded.length - 1].role === 'user') {
          loaded.push({
            id: `interrupted-${activeChatId}`,
            role: 'assistant',
            content: '',
            attachments: [],
            timestamp: '',
          });
        }

        setChats((prev) =>
          prev.map((c) => (c.id === activeChatId ? { ...c, messages: loaded, loaded: true } : c))
        );
        setHasMoreEarlier(!!data.hasMore);
        oldestCursorRef.current = data.oldestDate || null;
      } catch (err) {
        loadedChatRef.current.delete(activeChatId); // allow Retry to re-fetch
        if (!cancelled) {
          console.error('Failed to load thread messages:', err);
          setChatsError(err.message); // inline error banner offers Retry
        }
      } finally {
        if (!cancelled) setMsgsLoading(false);
      }
    }
    loadChatMessages();
    return () => { cancelled = true; };
  }, [activeChatId]);

  // Keep ?chatId= in the URL and localStorage in sync so a reload reopens this chat
  useEffect(() => {
    if (!activeChatId) return;
    safeWriteLS(ACTIVE_CHAT_KEY, activeChatId);
    const params = new URLSearchParams(window.location.search);
    if (params.get('chatId') !== activeChatId) {
      params.set('chatId', activeChatId);
      router.replace(`/chat?${params.toString()}`, { scroll: false });
    }
  }, [activeChatId, router]);

  // Debounced tiny cache (1s, 20 chats x 20 messages, no attachments) — wrapped
  // in try/catch so a QuotaExceededError can never break the app
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const slim = chats.slice(0, CACHE_MAX_CHATS).map((c) => ({
          id: c.id,
          title: c.title,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          loaded: c.loaded,
          messages: c.messages.slice(-CACHE_MAX_MSGS).map((m) => ({
            id: m.id,
            role: m.role,
            content: getText(m.content).slice(0, 4000),
            timestamp: m.timestamp,
          })),
        }));
        safeWriteLS(CHATS_CACHE_KEY, JSON.stringify(slim));
      } catch {
        // storage full/unavailable — cache is optional, ignore
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [chats]);

  const activeChat = chats.find((c) => c.id === activeChatId);
  const messages = activeChat ? activeChat.messages : [];

  const scrollToBottom = (smooth = false) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  // Prepending older messages must keep the viewport anchored (handled below);
  // otherwise we stick to the bottom as new content streams in.
  useEffect(() => {
    // Prepending older messages: keep the viewport anchored to the message the
    // user was reading instead of scrolling to the bottom
    if (prependRestoreRef.current && scrollRef.current) {
      const el = scrollRef.current;
      el.scrollTop = el.scrollHeight - prependRestoreRef.current.height + prependRestoreRef.current.top;
      prependRestoreRef.current = null;
      return;
    }
    if (msgsLoading || earlierLoading) return;
    scrollToBottom(!isStreaming);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isStreaming, msgsLoading]);

  // Load older messages when the user asks (scroll-to-top button)
  const handleLoadEarlier = async () => {
    if (!activeChatId || !oldestCursorRef.current || earlierLoading) return;
    setEarlierLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};
      const res = await fetch(
        `/api/chat-history?chatId=${encodeURIComponent(activeChatId)}&before=${encodeURIComponent(new Date(oldestCursorRef.current).toISOString())}`,
        { headers }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const older = (data.messages || []).map((m) => ({
        id: m._id,
        role: m.role,
        content: m.content,
        attachments: m.attachments || [],
        timestamp: m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
      })).reverse();

      if (older.length > 0) {
        const el = scrollRef.current;
        prependRestoreRef.current = el ? { height: el.scrollHeight, top: el.scrollTop } : null;
        setChats((prev) =>
          prev.map((c) => (c.id === activeChatId ? { ...c, messages: [...older, ...c.messages] } : c))
        );
      }
      setHasMoreEarlier(!!data.hasMore);
      oldestCursorRef.current = data.oldestDate || oldestCursorRef.current;
    } catch (err) {
      console.error('Failed to load earlier messages:', err);
    } finally {
      setEarlierLoading(false);
    }
  };

  const handleNewChat = () => {
    const newId = `chat-${Date.now()}`;
    const newChatObj = {
      id: newId,
      title: 'New Security Chat',
      createdAt: new Date().toISOString(),
      messages: [],
      loaded: true, // local chat — nothing to fetch from the server
    };
    setChats((prev) => [newChatObj, ...prev]);
    setActiveChatId(newId);
    loadedChatRef.current.add(newId); // local chat, nothing to fetch
    setHasMoreEarlier(false);
    oldestCursorRef.current = null;
  };

  const handleDeleteChat = (chatId) => {
    loadedChatRef.current.delete(chatId);
    setChats((prev) => {
      const updated = prev.filter((c) => c.id !== chatId);
      if (activeChatId === chatId) {
        setActiveChatId(updated.length > 0 ? updated[0].id : null);
      }
      return updated;
    });
  };

  // Determine active target model string
  const targetModel = selectedModel;

  const handleSendMessage = async (text, attachments = [], historyOverride = null) => {
    let currentChatId = activeChatId;
    const titleText = text || (attachments.length > 0 ? `File: ${attachments[0].name}` : 'New Chat');

    if (!currentChatId || !activeChat) {
      const newId = `chat-${Date.now()}`;
      const newChatObj = {
        id: newId,
        title: titleText.slice(0, 30) + '...',
        createdAt: new Date().toISOString(),
        messages: [],
        loaded: true,
      };
      setChats((prev) => [newChatObj, ...prev]);
      setActiveChatId(newId);
      currentChatId = newId;
    }

    // Process text prompt to include code/document file content if attached
    let fullTextPrompt = text;
    if (attachments && attachments.length > 0) {
      attachments.forEach((att) => {
        if (!att.isImage && att.textContent) {
          if (att.isPdf) {
            const pageInfo = att.pageCount ? ` (${att.pageCount} pages)` : '';
            fullTextPrompt += `\n\n[Attached PDF Document: ${att.name}${pageInfo}]\n\`\`\`\n${att.textContent}\n\`\`\``;
          } else {
            fullTextPrompt += `\n\n[Attached Document: ${att.name}]\n\`\`\`\n${att.textContent}\n\`\`\``;
          }
        }
      });
    }

    const userMsg = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      attachments: attachments,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setChats((prev) =>
      prev.map((c) => {
        if (c.id === currentChatId) {
          return {
            ...c,
            title: c.messages.length === 0 ? titleText.slice(0, 30) : c.title,
            messages: [...c.messages, userMsg],
          };
        }
        return c;
      })
    );

    const assistantMsgId = `msg-asst-${Date.now()}`;
    const assistantMsg = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setChats((prev) =>
      prev.map((c) => {
        if (c.id === currentChatId) {
          return { ...c, messages: [...c.messages, assistantMsg] };
        }
        return c;
      })
    );

    setIsStreaming(true);

    try {
      abortControllerRef.current = new AbortController();

      // History: the server does the token-budget trimming (trimHistory), so we
      // only send role + flattened text here — never base64 or file payloads
      const sourceHistory = historyOverride !== null
        ? historyOverride
        : (activeChat ? activeChat.messages : []);
      const historyMessages = sourceHistory.map((m) => ({
        role: m.role,
        content: getText(m.content),
      }));

      // Support multimodal OpenRouter payload for image attachments
      const imageAtts = attachments ? attachments.filter((a) => a.isImage && a.dataUrl) : [];
      let apiUserContent = fullTextPrompt;

      if (imageAtts.length > 0) {
        apiUserContent = [
          { type: 'text', text: fullTextPrompt || 'Analyze this attached image.' },
          ...imageAtts.map((img) => ({
            type: 'image_url',
            image_url: { url: img.dataUrl },
          })),
        ];
      }

      const apiMessages = [
        ...historyMessages,
        { role: 'user', content: apiUserContent },
      ];

      // Fetch current Supabase JWT token if user is logged in
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      const headers = {
        'Content-Type': 'application/json',
      };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      // Strip large data (dataUrl, textContent) from attachments before sending to backend
      const attachmentMeta = attachments.map((att) => ({
        name: att.name,
        size: att.size,
        type: att.type,
        isImage: att.isImage,
        isPdf: att.isPdf || false,
        pageCount: att.pageCount || null,
        driveUrl: att.driveUrl || null,
        driveFileId: att.driveFileId || null,
      }));

      const response = await fetch('/api/send-message', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          chatId: currentChatId,
          model: targetModel,
          messages: apiMessages,
          attachments: attachmentMeta,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to fetch AI response');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = '';

      let buffer = '';
      let lastRenderTime = 0;
      const RENDER_THROTTLE_MS = 60; // 60ms batching prevents UI thread stutter

      const updateAssistantMessage = (content) => {
        setChats((prev) =>
          prev.map((c) => {
            if (c.id === currentChatId) {
              return {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantMsgId ? { ...m, content } : m
                ),
              };
            }
            return c;
          })
        );
      };

      while (true) {
        // Stall watchdog: if the network dies mid-stream, reader.read() never
        // resolves AND never rejects — without this the UI hangs at "streaming" forever
        let stallTimer;
        const stallGuard = new Promise((_, reject) => {
          stallTimer = setTimeout(
            () => reject(new Error('No response from the AI for 60s — connection stalled. Check your network and retry.')),
            60000
          );
        });
        let chunk;
        try {
          chunk = await Promise.race([reader.read(), stallGuard]);
        } finally {
          clearTimeout(stallTimer);
        }
        const { value, done } = chunk;
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Keep the last partial line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim().startsWith('data: ')) {
            const dataStr = line.trim().replace('data: ', '').trim();
            if (dataStr === '[DONE]') continue;

            try {
              const json = JSON.parse(dataStr);
              const delta = json.choices?.[0]?.delta?.content || '';
              if (delta) {
                accumulatedContent += delta;
                const now = Date.now();
                if (now - lastRenderTime > RENDER_THROTTLE_MS) {
                  lastRenderTime = now;
                  updateAssistantMessage(accumulatedContent);
                }
              }
            } catch (e) {
              // Parse error ignored
            }
          }
        }
      }

      // Ensure final full text is committed to UI
      updateAssistantMessage(accumulatedContent);

      // Save completed AI assistant response to MongoDB
      if (accumulatedContent) {
        try {
          const saveRes = await fetch('/api/save-message', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              chatId: currentChatId,
              role: 'assistant',
              content: accumulatedContent,
            }),
          });
          if (!saveRes.ok) {
            console.error('Failed to save AI response:', await saveRes.text());
          }
        } catch (e) {
          console.error('Network error saving AI response:', e);
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setChats((prev) =>
          prev.map((c) => {
            if (c.id === currentChatId) {
              return {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content || `Error: ${err.message}` }
                    : m
                ),
              };
            }
            return c;
          })
        );
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  // Regenerate an interrupted/failed reply: drop the trailing empty assistant
  // message locally and re-run the last user turn (it is re-saved server-side)
  const handleRegenerate = () => {
    if (!activeChat || isStreaming) return;
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    setChats((prev) =>
      prev.map((c) => {
        if (c.id === activeChatId) {
          const trimmedMsgs = [...c.messages];
          while (trimmedMsgs.length > 0 && trimmedMsgs[trimmedMsgs.length - 1].role === 'assistant') {
            trimmedMsgs.pop();
          }
          return { ...c, messages: trimmedMsgs };
        }
        return c;
      })
    );
    const historyWithoutTrailer = messages.filter((m) => m.id !== lastUser.id);
    // Re-send with the same text; attachments carry display metadata only
    handleSendMessage(getText(lastUser.content), lastUser.attachments || [], historyWithoutTrailer);
  };

  const handleStopStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  };

  return (
    <div className="chatbot-wrapper">
      <ChatSidebar
        collapsed={sidebarCollapsed}
        chats={chats}
        activeChatId={activeChatId}
        onSelectChat={(id) => setActiveChatId(id)}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        user={user}
        onLogout={onLogout}
        onBackToLanding={onBackToLanding}
      />

      <main className="chat-main">
        {/* Top Navbar Bar */}
        <div className="chat-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="btn btn-ghost"
              style={{ width: '36px', height: '36px', padding: 0 }}
              title="Toggle Sidebar"
            >
              ☰
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: '700', fontSize: '16px', letterSpacing: '-0.02em', color: 'var(--text-off-black)' }}>
                Zyra
              </span>
              
                
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="active-model-badge">
              ⚡ ACTIVE:
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="model-dropdown"
              >
                {models.map((mod) => (
                  <option key={mod.id} value={mod.id}>
                    {mod.name}
                  </option>
                ))}
              </select>
            </span>

            

            {user && (
              <div className="user-profile-badge" style={{ height: '34px', padding: '2px 10px 2px 4px' }}>
                <span className="user-avatar">
                  {user.name
                    ? user.name.charAt(0).toUpperCase()
                    : user.email
                    ? user.email.charAt(0).toUpperCase()
                    : user.avatar || 'U'}
                </span>
                <span
                  style={{
                    fontWeight: '600',
                    fontSize: '12px',
                    maxWidth: '130px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={user.name || user.email}
                >
                  {user.name || user.email}
                </span>
                {onLogout && (
                  <button onClick={onLogout} className="btn-logout" title="Sign Out">
                    LOGOUT
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Messages Stream Container */}
        <div className="chat-messages-container" ref={scrollRef}>
          <div className="messages-inner">
            {/* Inline error + Retry — never blank the page */}
            {chatsError && (
              <div className="chat-inline-error">
                <span>{"Couldn't load your chats: "}{chatsError}</span>
                <button onClick={() => loadChatList()} className="btn-retry">Retry</button>
              </div>
            )}

            {/* Load earlier messages (paging) */}
            {hasMoreEarlier && messages.length > 0 && (
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <button
                  onClick={handleLoadEarlier}
                  disabled={earlierLoading}
                  className="btn-retry"
                >
                  {earlierLoading ? 'Loading…' : 'Load earlier messages'}
                </button>
              </div>
            )}

            {chatsLoading || msgsLoading ? (
              <MessageSkeleton />
            ) : messages.length === 0 ? (
              <EmptyState
                userName={user?.name}
                onSelectSuggestion={(prompt) => handleSendMessage(prompt)}
              />
            ) : (
              messages.map((msg, idx) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  user={user}
                  isStreaming={isStreaming && idx === messages.length - 1 && msg.role === 'assistant'}
                  onRegenerate={handleRegenerate}
                />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Floating Chat Input Bar */}
        <div style={{ width: '100%', position: 'sticky', bottom: 0, paddingBottom: '16px' }}>
          <ChatInput
            onSendMessage={handleSendMessage}
            isStreaming={isStreaming}
            onStopStream={handleStopStream}
          />
        </div>
      </main>
    </div>
  );
}
