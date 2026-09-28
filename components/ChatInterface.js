'use client';

import { useState, useEffect, useRef } from 'react';
import ChatSidebar from './ChatSidebar';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import EmptyState from './EmptyState';
import ModelPickerPills from './ModelPickerPills';

export default function ChatInterface({ user, onLogout, onBackToLanding }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('anthropic/claude-3.5-sonnet');
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [customModelId, setCustomModelId] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);

  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Fetch available models dynamically from OpenRouter backend catalog
  useEffect(() => {
    async function fetchModels() {
      try {
        const res = await fetch('/api/models');
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

  // Load chats from LocalStorage on initial mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('gtis_ai_chats');
      if (saved) {
        const parsed = JSON.parse(saved);
        setChats(parsed);
        if (parsed.length > 0) {
          setActiveChatId(parsed[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load chats from localStorage:', err);
    }
  }, []);

  // Save chats to LocalStorage whenever chats state updates
  useEffect(() => {
    try {
      if (chats.length > 0) {
        localStorage.setItem('gtis_ai_chats', JSON.stringify(chats));
      }
    } catch (err) {
      console.error('Failed to save chats to localStorage:', err);
    }
  }, [chats]);

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
  const targetModel = isCustomModel && customModelId.trim()
    ? customModelId.trim()
    : selectedModel;

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

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: targetModel,
          messages: apiMessages,
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

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunkText = decoder.decode(value, { stream: true });
        const lines = chunkText.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (dataStr === '[DONE]') break;

            try {
              const json = JSON.parse(dataStr);
              const delta = json.choices?.[0]?.delta?.content || '';
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
            } catch (e) {
              // Parse error ignored
            }
          }
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
            <span className="active-model-indicator">
              ⚡ ACTIVE: {targetModel}
            </span>
            <button
              onClick={onBackToLanding}
              className="btn btn-sm-outline"
              style={{ color: 'var(--text-off-black)', borderColor: 'var(--border-ash)' }}
            >
              WEBSITE ▸
            </button>
          </div>
        </div>

        {/* Top Model Picker Bar */}
        <div style={{ width: '100%', padding: '8px 16px 0', borderBottom: '1px solid var(--border-ash)', background: 'var(--bg-parchment)' }}>
          <ModelPickerPills
            models={models}
            selectedModel={selectedModel}
            onSelectModel={(mId) => setSelectedModel(mId)}
            isCustomModel={isCustomModel}
            setIsCustomModel={setIsCustomModel}
            customModelId={customModelId}
            setCustomModelId={setCustomModelId}
          />
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
