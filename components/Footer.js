export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div className="brand-wordmark" style={{ fontSize: '14px' }}>
          GTIS <span className="brand-dot" aria-hidden="true"></span>
        </div>

        <ul className="footer-links">
          <li><a href="#privacy" className="footer-link">PRIVACY POLICY</a></li>
          <li><a href="#terms" className="footer-link">TERMS OF SERVICE</a></li>
          <li><a href="#status" className="footer-link">SYSTEM STATUS</a></li>
          <li><a href="#security" className="footer-link">SECURITY REPORT</a></li>
          <li><a href="#linkedin" className="footer-link">LINKEDIN</a></li>
        </ul>

        <div className="mono-small" style={{ fontSize: '12px' }}>
          © {currentYear} GTIS CYBERSECURITY INC. ALL RIGHTS RESERVED.
        </div>
      </div>
    </footer>
  );
}
