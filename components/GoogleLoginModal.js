'use client';

export function GoogleIcon() {
  return (
    <svg className="google-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
    </svg>
  );
}

export default function GoogleLoginModal({ isOpen, onClose, onGoogleSignIn }) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close modal">
          ✕
        </button>

        <span className="mono-small" style={{ color: 'var(--cta-lake-blue)', display: 'block', marginBottom: '8px' }}>
          GTIS CYBERSECURITY AUTH
        </span>

        <h3 className="card-title" style={{ fontSize: '28px', marginBottom: '12px' }}>
          Sign in to GTIS Security Portal
        </h3>

        <p className="mono-body" style={{ marginBottom: '28px', fontSize: '15px' }}>
          Access your threat intelligence dashboard, continuous compliance audits, and real-time SOC monitoring.
        </p>

        <button
          onClick={onGoogleSignIn}
          className="btn btn-google"
          style={{ width: '100%', height: '52px', fontSize: '14px', justifyContent: 'center' }}
        >
          <GoogleIcon />
          <span>CONTINUE WITH GOOGLE</span>
        </button>

        <div className="mono-small" style={{ fontSize: '11px', marginTop: '20px', color: 'var(--text-smoke)' }}>
          By continuing, you agree to GTIS Terms of Service and Privacy Policy.
        </div>
      </div>
    </div>
  );
}
