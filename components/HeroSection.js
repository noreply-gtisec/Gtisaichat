'use client';

import { GoogleIcon } from './GoogleLoginModal';

export default function HeroSection({ user, onOpenGoogleLogin }) {
  return (
    <section className="hero-section">
      <div className="hero-glow-wash" aria-hidden="true"></div>
      <div className="container hero-content">
       

        <h1 className="hero-title">
          Cybersecurity that measures what protects.
        </h1>

        <p className="mono-subtext" style={{ maxWidth: '720px' }}>
          We engineer precision AI threat detection and zero-trust systems for enterprise infrastructure. Zero false alarms, continuous containment, and verified risk math.
        </p>

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
