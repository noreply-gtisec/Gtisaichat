'use client';

import { GoogleIcon } from './GoogleLoginModal';
import Image from 'next/image';
import Link from 'next/link';

export default function Navbar({
  mobileMenuOpen,
  setMobileMenuOpen,
  user,
  onOpenGoogleLogin,
  onLogout
}) {
  return (
    <header className="site-header">
      <div className="container nav-container">
        <Link href="/" className="brand-wordmark" aria-label="GTIS home">
  <Image
    src="/logo.png"
    alt="GTIS"
    width={100}
    height={50}
    priority
  />
</Link>

       

        <div className="nav-actions">
          {user ? (
            <div className="user-profile-badge">
              <span className="user-avatar">{user.name.charAt(0)}</span>
              <span>{user.name}</span>
              <button onClick={onLogout} className="btn-logout" title="Sign Out">
                LOGOUT
              </button>
            </div>
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

          <a href="https://gtis.ai/contact" className="btn btn-primary-blue" style={{ height: '40px', fontSize: '13px', padding: '0 18px' }}>
            BOOK A CALL ▸
          </a>

          <button
            className="mobile-menu-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? 'CLOSE' : 'MENU'}
          </button>
        </div>
      </div>
    </header>
  );
}
