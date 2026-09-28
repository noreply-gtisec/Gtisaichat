export default function SocialProof() {
  const partners = [
    'LUMINA SEC',
    'NEXUS LABS',
    'VOLT SHIELD',
    'SYNERGY DEFENSE',
    'KINETIC AI',
    'AURA CYBER',
    'APEX CORP',
  ];

  return (
    <section className="social-proof-section">
      <div className="container">
        <p className="social-proof-header">
          TRUSTED BY SECURITY & TECH LEADERS AT
        </p>
        <div className="partner-logos-row">
          {partners.map((partner) => (
            <span key={partner} className="partner-logo-item">
              {partner}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
