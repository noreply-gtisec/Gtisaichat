'use client';

export default function ModelPickerPills({
  models,
  selectedModel,
  onSelectModel
}) {
  const topFeaturedModels = [
    { id: 'openai/gpt-6-luna-pro', label: 'GPT-6 Luna Pro', icon: '🧠' },
    { id: 'openai/gpt-6-luna', label: 'GPT-6 Luna', icon: '⚡' },
    { id: 'deepseek/deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash', icon: '🔍' },
    { id: 'ibm-granite/granite-4.2-8b', label: 'Granite 4.2 8B', icon: '🏢' },
    { id: 'upstage/solar-mini-4', label: 'Solar Mini 4', icon: '☀️' },
    { id: 'xiaomi/mimo-v2.6-flash', label: 'MiMo-V2.6-Flash', icon: '📱' },
    { id: 'inclusionai/ling-3.0-flash-vl', label: 'Ling 3.0 Flash VL', icon: '👁️' },
  ];

  return (
    <div className="model-picker-bar">
      <span className="mono-small" style={{ fontSize: '11px', color: 'var(--cta-lake-blue)', fontWeight: 'bold', marginRight: '4px' }}>
        AI MODELS:
      </span>

      {topFeaturedModels.map((m) => {
        const isActive = selectedModel === m.id;
        return (
          <button
            key={m.id}
            type="button"
            className={`model-picker-pill ${isActive ? 'active' : ''}`}
            onClick={() => onSelectModel(m.id)}
          >
            <span>{m.icon}</span>
            <span>{m.label}</span>
          </button>
        );
      })}

      <select
        value={selectedModel}
        onChange={(e) => {
          if (e.target.value) {
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
    </div>
  );
}
