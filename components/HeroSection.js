'use client';

import { GoogleIcon } from './GoogleLoginModal';

export default function HeroSection({ user, onOpenGoogleLogin }) {
  return (
    <section className="hero-section">
      <div className="hero-glow-wash" aria-hidden="true"></div>
      <div className="container hero-content">
       

        <h1 className="hero-title">
                  Meet Zyra, your GTIS AI security assistant.</h1>

        <p className="mono-subtext" style={{ maxWidth: '800px' }}>
         Ask anything, from everyday questions to threats, vulnerabilities, compliance, and zero-trust architecture.
          Security is what we do best. Built on GTIS's precision threat detection and verified risk math, so you get clear, reliable answers instead of noise.                    </p>

        <div className="hero-ctas">
          
          {!user ? (
            <button onClick={onOpenGoogleLogin} className="btn btn-google">
              <GoogleIcon />
              <span>LOGIN WITH GOOGLE</span>
            </button>
          ) : (
            <a href="#work" className="btn btn-ghost">
              SEE DEFENSE METRICS
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
