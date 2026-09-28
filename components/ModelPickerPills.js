'use client';

export default function ModelPickerPills({
  models,
  selectedModel,
  onSelectModel,
  isCustomModel,
  setIsCustomModel,
  customModelId,
  setCustomModelId
}) {
  const topFeaturedModels = [
    { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', icon: '🌐' },
    { id: 'deepseek/deepseek-r1', label: 'DeepSeek R1', icon: '🔍' },
    { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B', icon: '🦙' },
    { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5', icon: '🧠' },
    { id: 'openai/gpt-4o', label: 'GPT-4o', icon: '⚡' },
  ];

  return (
    <div className="model-picker-bar">
      <span className="mono-small" style={{ fontSize: '11px', color: 'var(--cta-lake-blue)', fontWeight: 'bold', marginRight: '4px' }}>
        AI MODELS:
      </span>

      {topFeaturedModels.map((m) => {
        const isActive = !isCustomModel && selectedModel === m.id;
        return (
          <button
            key={m.id}
            type="button"
            className={`model-picker-pill ${isActive ? 'active' : ''}`}
            onClick={() => {
              setIsCustomModel(false);
              onSelectModel(m.id);
            }}
          >
            <span>{m.icon}</span>
            <span>{m.label}</span>
          </button>
        );
      })}

      <select
        value={isCustomModel ? '' : selectedModel}
        onChange={(e) => {
          if (e.target.value) {
            setIsCustomModel(false);
            onSelectModel(e.target.value);
          }
        }}
        className="model-picker-pill"
        style={{ cursor: 'pointer', outline: 'none' }}
      >
        <option value="">▼ ALL OPENROUTER MODELS</option>
        {models.map((mod) => (
          <option key={mod.id} value={mod.id}>
            {mod.name}
          </option>
        ))}
      </select>

      {isCustomModel ? (
        <input
          type="text"
          placeholder="Custom ID (e.g. google/gemini-2.5-pro)"
          value={customModelId}
          onChange={(e) => setCustomModelId(e.target.value)}
          className="model-picker-pill active"
          style={{ width: '220px', outline: 'none' }}
          autoFocus
        />
      ) : (
        <button
          type="button"
          className="model-picker-pill"
          onClick={() => setIsCustomModel(true)}
          title="Enter custom OpenRouter Model ID"
        >
          <span>+ CUSTOM</span>
        </button>
      )}
    </div>
  );
}
