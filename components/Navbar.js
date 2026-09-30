'use client';

import { GoogleIcon } from './GoogleLoginModal';
import Image from 'next/image';
import Link from 'next/link';

export default function Navbar({
  user,
  onOpenGoogleLogin,
  onOpenChat,
  onLogout,
}) {
  return (
    <header className="site-header">
      <div className="container nav-container">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link href="/?landing=true" className="brand-wordmark" aria-label="GTIS home">
            <Image
              src="/logo.png"
              alt="GTIS"
              width={100}
              height={50}
              priority
            />
          </Link>
          </div>

        <div className="nav-actions">
          {user ? (
            <>
              <button
                onClick={onOpenChat}
                className="btn btn-ghost"
                style={{ height: '40px', fontSize: '12px', padding: '0 16px' }}
              >
                OPEN CHAT ▸
              </button>
              <div className="user-profile-badge">
                <span className="user-avatar">
                  {user?.name
                    ? user.name.charAt(0).toUpperCase()
                    : user?.email
                    ? user.email.charAt(0).toUpperCase()
                    : 'U'}
                </span>
                <span>{user.name}</span>
                <button onClick={onLogout} className="btn-logout" title="Sign Out">
                  LOGOUT
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={onOpenGoogleLogin}
              className="btn btn-google"
              style={{ height: '40px', fontSize: '12px', padding: '0 16px' }}
            >
              <GoogleIcon />
              <span>Login</span>
            </button>
          )}

          <a
            href="https://gtis.ai/contact"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary-blue"
            style={{ height: '40px', fontSize: '13px', padding: '0 18px', textDecoration: 'none' }}
          >
            BOOK A CALL ▸
          </a>
        </div>
      </div>
    </header>
  );
}
