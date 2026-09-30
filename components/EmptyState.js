'use client';

export default function EmptyState({ userName, onSelectSuggestion }) {
  const suggestions = [
    {
      title: 'Audit Surface Attack Vectors',
      subtitle: 'Run a deep quantitative exposure assessment on cloud perimeter endpoints.'
    },
    {
      title: 'Generate Zero-Trust IAM Policy',
      subtitle: 'Build a hardened JSON access control matrix with mandatory MFA enforcement.'
    },
    {
      title: 'Scan Dark Web Leak Databases',
      subtitle: 'Check compromised enterprise credentials and exposed SSL keys.'
    },
    {
      title: 'SOC 2 Type II Compliance Roadmap',
      subtitle: 'Automate continuous audit pipelines across Kubernetes & API gateways.'
    }
  ];

  return (
    <div className="empty-state-container">
      
      <h2 className="serif-heading" style={{ fontSize: '42px', marginBottom: '8px' }}>
        Welcome, {userName || 'Security Officer'}
      </h2>
      <p className="mono-subtext" style={{ maxWidth: '620px', fontSize: '16px' }}>
        I&apos;m Zyra, your GTIS AI security assistant. Ask me anything from threat intelligence, zero-trust policies, and code auditing to everyday SecOps inquiries.
      </p>

      <div className="prompt-suggestions-grid">
        {suggestions.map((item, idx) => (
          <div
            key={idx}
            className="suggestion-card"
            onClick={() => onSelectSuggestion(item.title)}
          >
            <h4 className="serif-heading" style={{ fontSize: '18px', marginBottom: '6px' }}>
              {item.title}
            </h4>
            <p className="mono-body" style={{ fontSize: '13px', color: 'var(--text-smoke)' }}>
              {item.subtitle}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
