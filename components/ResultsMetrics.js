export default function ResultsMetrics() {
  const metrics = [
    {
      stat: '99.98%',
      label: 'AUTOMATED THREAT CONTAINMENT',
      title: 'Enterprise FinTech Defense',
      description: 'Intercepted and neutralized over 1.4 million malicious queries and ransomware vectors with sub-second automated containment.',
    },
    {
      stat: '<3.8 Min',
      label: 'AVG RESPONSE TIME (MTTR)',
      title: 'Global Healthcare SOC',
      description: 'Reduced average security incident response and containment window from 4.2 hours down to under 3.8 minutes across 18,000 active endpoints.',
    },
    {
      stat: '100%',
      label: 'SOC 2 TYPE II COMPLIANCE',
      title: 'SaaS Cloud Platform',
      description: 'Architected zero-trust continuous compliance engine, achieving 100% SOC 2 Type II compliance with zero manual audit overhead.',
    },
  ];

  return (
    <section id="work" className="section-padding">
      <div className="container">
        <span className="mono-small">03 / PROVEN METRICS</span>
        <h2 className="section-title" style={{ marginTop: '8px' }}>
          Verifiable Security Outcomes
        </h2>

        <div className="results-grid">
          {metrics.map((item, index) => (
            <div key={index} className="monad-card">
              <div>
                <div className="stat-number">{item.stat}</div>
                <div className="stat-label">{item.label}</div>
                <h3 className="card-title" style={{ fontSize: '20px', marginBottom: '8px' }}>
                  {item.title}
                </h3>
                <p className="mono-body" style={{ fontSize: '14px' }}>
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
