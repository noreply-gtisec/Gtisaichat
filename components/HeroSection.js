'use client';

import { GoogleIcon } from './GoogleLoginModal';

export default function HeroSection({ user, onOpenGoogleLogin, onOpenChat }) {
  return (
    <section className="hero-section">
      <div className="hero-glow-wash" aria-hidden="true"></div>
      <div className="container hero-content">
        <h1 className="hero-title">
          Meet Zyra, your GTIS AI security assistant.
        </h1>

        <p className="mono-subtext" style={{ maxWidth: '780px' }}>
          Ask anything, from everyday questions to threats, vulnerabilities, compliance, and zero-trust architecture.
          Security is what we do best. Built on GTIS&apos;s precision threat detection and verified risk math, so you get clear, reliable answers instead of noise.
        </p>

        <div className="hero-ctas" style={{ flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          {!user ? (
            <>
              <button
                onClick={onOpenGoogleLogin}
                className="btn btn-google"
                style={{ minWidth: '240px', justifyContent: 'center' }}
              >
                <GoogleIcon />
                <span>SIGN IN WITH GOOGLE</span>
              </button>
              <span
                style={{
                  fontSize: '12px',
                  color: 'var(--text-smoke, #64748b)',
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              >
                🔒 Authorized access restricted to @gtisec.com accounts
              </span>
            </>
          ) : (
            <button
              onClick={onOpenChat || onOpenGoogleLogin}
              className="btn btn-primary-blue"
              style={{ minWidth: '240px', justifyContent: 'center', fontSize: '14px', height: '48px' }}
            >
              LAUNCH ZYRA CHAT ▸
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
