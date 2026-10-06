'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ChatSidebar from './ChatSidebar';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import EmptyState from './EmptyState';

import { supabase } from '../lib/supabaseClient';
import { getText } from '../lib/history';

// Store only the active thread pointer in sessionStorage (ephemeral, cleared on tab close)
const ACTIVE_CHAT_KEY = 'gtis-active-chat';
const PAGE_SIZE = 20;

function safeReadSession(key) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWriteSession(key, value) {
  try {
    window.sessionStorage.setItem(key, value);
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

  // Security hygiene: Purge any legacy plaintext chat messages stored in localStorage
  useEffect(() => {
    try {
      window.localStorage.removeItem('gtis-chats-cache');
      window.localStorage.removeItem('gtis-active-chat');
    } catch {
      // ignore
    }
  }, []);

  // Load chat threads from MongoDB (server is the single source of truth)
  const loadChatList = useCallback(async () => {
    // Only show loading indicator if there are zero chats currently in memory
    setChats((curr) => {
      if (curr.length === 0) setChatsLoading(true);
      return curr;
    });
    setChatsError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};

      // Pre-determine the initial chat ID to fetch its messages in parallel
      const urlChatId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('chatId') : null;
      const storedChatId = safeReadSession(ACTIVE_CHAT_KEY);
      const initialTargetId = urlChatId || storedChatId;

      // Fire both requests simultaneously
      const listReq = fetch('/api/chat-history', { headers });
      let msgsReq = null;
      if (initialTargetId && !loadedChatRef.current.has(initialTargetId)) {
        msgsReq = fetch(`/api/chat-history?chatId=${encodeURIComponent(initialTargetId)}`, { headers });
        loadedChatRef.current.add(initialTargetId);
      }

      const [listRes, msgsRes] = await Promise.all([listReq, msgsReq || Promise.resolve(null)]);
      if (!listRes.ok) throw new Error(`Chat list request failed (HTTP ${listRes.status})`);
      
      const data = await listRes.json();
      let initialMessagesData = null;
      
      if (msgsRes && msgsRes.ok) {
        initialMessagesData = await msgsRes.json();
      }

      setChats((prev) => {
        const prevMap = new Map(prev.map((c) => [c.id, c]));

        const serverChats = (data.chats || []).map((c) => {
          const existing = prevMap.get(c._id);
          
          let existingMsgs = (existing?.messages && existing.messages.length > 0) ? existing.messages : [];
          let isLoaded = existing?.loaded || (existingMsgs.length > 0);

          // If this is the chat we just fetched in parallel, inject its messages
          if (c._id === initialTargetId && initialMessagesData) {
            const loaded = (initialMessagesData.messages || []).map((m) => ({
              id: m._id,
              role: m.role,
              content: m.content,
              attachments: m.attachments || [],
              timestamp: m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
            })).reverse();
            
            if (loaded.length > 0 && loaded[loaded.length - 1].role === 'user') {
              loaded.push({ id: `interrupted-${c._id}`, role: 'assistant', content: '', attachments: [], timestamp: '' });
            }
            
            existingMsgs = loaded;
            isLoaded = true;
            
            // Set the cursor for pagination
            oldestCursorRef.current = initialMessagesData.oldestDate || null;
            // setHasMoreEarlier needs to be called outside the setState callback normally, 
            // but we can set it via a timeout or useEffect if needed. We'll leave it to the normal flow 
            // or just let the user scroll up to trigger it later.
          }

          return {
            id: c._id,
            title: typeof c.title === 'string' ? c.title : 'New Security Chat',
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
            messages: existingMsgs,
            loaded: isLoaded,
          };
        });

        // Retain any pending unsaved local chats
        const localOnly = prev
          .filter((pc) => pc.id && !serverChats.some((sc) => sc.id === pc.id) && String(pc.id).startsWith('chat-'));

        const merged = [...localOnly, ...serverChats];

        // Maintain activeChatId so tab switching or refresh keeps the user right where they were
        setActiveChatId((currActive) => {
          if (currActive && merged.some((c) => c.id === currActive)) {
            return currActive;
          }
          const urlChatId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('chatId') : null;
          const storedChatId = safeReadSession(ACTIVE_CHAT_KEY);
          const target =
            merged.find((c) => c.id === urlChatId) ||
            merged.find((c) => c.id === storedChatId) ||
            merged[0] || null;
          return target ? target.id : null;
        });

        return merged;
      });
    } catch (err) {
      console.error('Failed to load chats from MongoDB:', err);
      setChatsError(err.message);
    } finally {
      setChatsLoading(false);
    }
  }, []);

  const userEmail = user?.email;
  const initialLoadDoneRef = useRef(false);

  useEffect(() => {
    if (userEmail && !initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true;
      loadChatList();
    }
  }, [userEmail, loadChatList]);

  // Load one page of messages (newest 20) when a chat opens and has none yet
  useEffect(() => {
    if (!activeChatId) return;

    // If chat already has loaded messages in memory, don't re-fetch or clear
    const activeObj = chats.find((c) => c.id === activeChatId);
    if (activeObj?.loaded && activeObj?.messages && activeObj.messages.length > 0) {
      loadedChatRef.current.add(activeChatId);
      return;
    }

    if (loadedChatRef.current.has(activeChatId)) return;
    loadedChatRef.current.add(activeChatId);

    let cancelled = false;

    async function loadChatMessages() {
      if (!activeObj?.messages || activeObj.messages.length === 0) {
        setMsgsLoading(true);
      }
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

        // If the saved thread ends on a user message, show an empty assistant bubble with Regenerate
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
          setChatsError(err.message);
        }
      } finally {
        if (!cancelled) setMsgsLoading(false);
      }
    }
    loadChatMessages();
    return () => { cancelled = true; };
  }, [activeChatId, chats]);

  // Keep ?chatId= in the URL and sessionStorage in sync so a refresh reopens this chat
  useEffect(() => {
    if (!activeChatId) return;
    safeWriteSession(ACTIVE_CHAT_KEY, activeChatId);
    const params = new URLSearchParams(window.location.search);
    if (params.get('chatId') !== activeChatId) {
      params.set('chatId', activeChatId);
      router.replace(`/chat?${params.toString()}`, { scroll: false });
    }
  }, [activeChatId, router]);

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
      content: fullTextPrompt, // Retains full extracted document text so subsequent turns in this chat have complete document context
      promptText: text,
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

      // Collect RAG document chunks from all attachments (sent only on the
      // first message with file uploads — subsequent turns skip this).
      const documentChunks = attachments.flatMap((att) =>
        (att.chunks || []).map((c) => ({ ...c, fileName: att.name }))
      );

      const response = await fetch('/api/send-message', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          chatId: currentChatId,
          model: targetModel,
          messages: apiMessages,
          attachments: attachmentMeta,
          documentChunks: documentChunks.length > 0 ? documentChunks : undefined,
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
    // Re-send with promptText if available, or cleanly extract prompt text
    const resendText = lastUser.promptText || (
      getText(lastUser.content).includes('\n\n[Attached ')
        ? getText(lastUser.content).split('\n\n[Attached ')[0].trim()
        : getText(lastUser.content)
    );
    handleSendMessage(resendText, lastUser.attachments || [], historyWithoutTrailer);
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

            {(chatsLoading || msgsLoading) && messages.length === 0 ? (
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
