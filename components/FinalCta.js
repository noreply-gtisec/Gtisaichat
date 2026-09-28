export default function FinalCta() {
  return (
    <section id="audit" className="final-cta-section">
      <div className="container final-cta-container">
        <span className="mono-small">GET STARTED TODAY</span>
        <h2 className="serif-heading" style={{ fontSize: '48px', maxWidth: '700px' }}>
          Ready to eliminate your security blindspots?
        </h2>
        <p className="mono-subtext" style={{ maxWidth: '600px' }}>
          Book a complimentary 30-minute cybersecurity audit with our senior SecOps engineers. You will receive an immediate attack surface breakdown and mitigation roadmap.
        </p>
        <div className="hero-ctas">
          <a href="#audit" className="btn btn-primary-blue">
            BOOK A FREE AUDIT ▸
          </a>
          <a href="#faq" className="btn btn-off-black">
            VIEW SECURITY TIERS
          </a>
        </div>
      </div>
    </section>
  );
}
