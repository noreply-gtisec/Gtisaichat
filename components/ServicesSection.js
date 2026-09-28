export default function ServicesSection() {
  const services = [
    {
      num: '01',
      title: 'Autonomous SOC & Incident Response',
      description: '24/7 AI threat correlation, real-time intrusion hunting, and sub-second endpoint isolation that neutralizes attacks before lateral movement.',
      tag: 'REAL-TIME THREAT MATRIX',
      isFeatured: false,
    },
    {
      num: '02',
      title: 'AI Zero-Trust & Vulnerability Engine',
      description: 'Continuous automated penetration testing, IAM policy enforcement, and proactive CVE patch orchestration tailored to enterprise cloud environments.',
      tag: 'ZERO-TRUST MATRIX',
      featuredTag: 'FEATURED DEFENSE ENGINE',
      isFeatured: true,
    },
    {
      num: '03',
      title: 'Cloud & Infrastructure Hardening',
      description: 'Multi-cloud Kubernetes security, microservice payload encryption, and API gateway defense shielding mission-critical assets against zero-day exploits.',
      tag: 'INFRASTRUCTURE HARDENING',
      isFeatured: false,
    },
    {
      num: '04',
      title: 'Compliance & Governance Automation',
      description: 'Automated ISO 27001, SOC 2 Type II, HIPAA, and NIST audit pipelines engineered to maintain continuous zero-friction compliance.',
      tag: 'GOVERNANCE & COMPLIANCE',
      isFeatured: false,
    },
  ];

  return (
    <section id="services" className="section-padding">
      <div className="container">
        <span className="mono-small">01 / CAPABILITIES</span>
        <h2 className="section-title" style={{ marginTop: '8px' }}>
          Engineered Cyber Defense Services
        </h2>

        <div className="card-grid-2x2">
          {services.map((service) =>
            service.isFeatured ? (
              <div key={service.num} className="monad-card card-highlight-periwinkle">
                <div className="card-top">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="card-icon" style={{ borderColor: 'rgba(43,89,209,0.3)', backgroundColor: '#ffffff' }}>
                      {service.num}
                    </div>
                    <span className="illustration-tag">{service.featuredTag}</span>
                  </div>
                  <h3 className="card-title" style={{ marginTop: '12px' }}>
                    {service.title}
                  </h3>
                  <p className="mono-body" style={{ color: 'var(--text-off-black)' }}>
                    {service.description}
                  </p>
                </div>

                <div className="periwinkle-illustration" aria-hidden="true">
                  <div className="illustration-shape-1"></div>
                  <div className="illustration-shape-2"></div>
                  <span className="illustration-tag">{service.tag}</span>
                </div>
              </div>
            ) : (
              <div key={service.num} className="monad-card">
                <div className="card-top">
                  <div className="card-icon">{service.num}</div>
                  <h3 className="card-title">{service.title}</h3>
                  <p className="mono-body">{service.description}</p>
                </div>
                <div className="mono-small" style={{ color: 'var(--text-smoke)' }}>
                  {service.tag}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </section>
  );
}
