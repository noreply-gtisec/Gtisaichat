'use client';

import { useState, useEffect, useRef } from 'react';
import ChatSidebar from './ChatSidebar';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import EmptyState from './EmptyState';

import { supabase } from '../lib/supabaseClient';

export default function ChatInterface({ user, onLogout, onBackToLanding }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('openai/gpt-6-luna-pro');
  const [isStreaming, setIsStreaming] = useState(false);
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);

  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);


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

  // Load chat threads from MongoDB on user load
  useEffect(() => {
    async function loadUserChats() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const headers = session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {};

        const res = await fetch('/api/chat-history', { headers });
        if (res.ok) {
          const data = await res.json();
          if (data.chats && data.chats.length > 0) {
            const formatted = data.chats.map((c) => ({
              id: c._id,
              title: c.title || 'New Security Audit',
              createdAt: c.createdAt,
              messages: [],
            }));
            setChats(formatted);
            setActiveChatId(formatted[0].id);
          } else {
            setChats([]);
            setActiveChatId(null);
          }
        }
      } catch (err) {
        console.error('Failed to load chats from MongoDB:', err);
      }
    }
    loadUserChats();
  }, [user]);

  // Load messages for active chat thread from MongoDB if empty
  useEffect(() => {
    if (!activeChatId) return;
    const currentChat = chats.find((c) => c.id === activeChatId);
    if (currentChat && currentChat.messages && currentChat.messages.length > 0) return;

    async function loadChatMessages() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const headers = session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {};

        const res = await fetch(`/api/chat-history?chatId=${activeChatId}`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (data.messages) {
            setChats((prev) =>
              prev.map((c) => {
                if (c.id === activeChatId) {
                  return {
                    ...c,
                    messages: data.messages.map((m) => ({
                      id: m._id,
                      role: m.role,
                      content: m.content,
                      attachments: m.attachments || [],
                      timestamp: m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
                    })),
                  };
                }
                return c;
              })
            );
          }
        }
      } catch (err) {
        console.error('Failed to load thread messages:', err);
      }
    }
    loadChatMessages();
  }, [activeChatId]);

  const activeChat = chats.find((c) => c.id === activeChatId);
  const messages = activeChat ? activeChat.messages : [];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming]);

  const handleNewChat = () => {
    const newId = `chat-${Date.now()}`;
    const newChatObj = {
      id: newId,
      title: 'New Security Audit',
      createdAt: new Date().toISOString(),
      messages: [],
    };
    setChats((prev) => [newChatObj, ...prev]);
    setActiveChatId(newId);
  };

  const handleDeleteChat = (chatId) => {
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

  const handleSendMessage = async (text, attachments = []) => {
    let currentChatId = activeChatId;
    const titleText = text || (attachments.length > 0 ? `File: ${attachments[0].name}` : 'New Audit');

    if (!currentChatId || !activeChat) {
      const newId = `chat-${Date.now()}`;
      const newChatObj = {
        id: newId,
        title: titleText.slice(0, 30) + '...',
        createdAt: new Date().toISOString(),
        messages: [],
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
          fullTextPrompt += `\n\n[Attached Document: ${att.name}]\n\`\`\`\n${att.textContent}\n\`\`\``;
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

      const historyMessages = (activeChat ? activeChat.messages : []).map((m) => ({
        role: m.role,
        content: m.content,
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
      while (true) {
        const { value, done } = await reader.read();
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

                setChats((prev) =>
                  prev.map((c) => {
                    if (c.id === currentChatId) {
                      return {
                        ...c,
                        messages: c.messages.map((m) =>
                          m.id === assistantMsgId ? { ...m, content: accumulatedContent } : m
                        ),
                      };
                    }
                    return c;
                  })
                );
              }
            } catch (e) {
              // Parse error ignored
            }
          }
        }
      }

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
            <span className="mono-small" style={{ fontSize: '13px', color: 'var(--text-off-black)' }}>
              GTIS AI CHATBOT WORKSPACE
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
            
          </div>
        </div>



        {/* Messages Stream Container */}
        <div className="chat-messages-container">
          <div className="messages-inner">
            {messages.length === 0 ? (
              <EmptyState
                userName={user?.name}
                onSelectSuggestion={(prompt) => handleSendMessage(prompt)}
              />
            ) : (
              messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  onRegenerate={() => {
                    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
                    if (lastUser) handleSendMessage(lastUser.content, lastUser.attachments);
                  }}
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
