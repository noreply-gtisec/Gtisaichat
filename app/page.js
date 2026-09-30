'use client';

import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import HeroSection from '../components/HeroSection';
import GoogleLoginModal from '../components/GoogleLoginModal';
import ChatInterface from '../components/ChatInterface';
import { supabase } from '../lib/supabaseClient';

export default function Home() {
  const [googleModalOpen, setGoogleModalOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [viewMode, setViewMode] = useState('landing'); // 'landing' | 'chat'
  const [authError, setAuthError] = useState(null);

  const ALLOWED_DOMAIN = 'gtisec.com';

  // Validate if email belongs to @gtisec.com
  const validateDomain = (email) => {
    if (!email) return false;
    return email.toLowerCase().trim().endsWith(`@${ALLOWED_DOMAIN}`);
  };

  // Supabase Auth session listener with @gtisec.com domain enforcement
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const u = session.user;
        const email = u.email || '';
        if (validateDomain(email)) {
          setUser({
            name: u.user_metadata?.full_name || email.split('@')[0] || 'GTIS Security Officer',
            email: email,
            avatar: u.user_metadata?.avatar_url,
          });
          setViewMode('chat');
          setAuthError(null);
        } else {
          // Reject unauthorized domain
          supabase.auth.signOut();
          setUser(null);
          setViewMode('landing');
          setAuthError(`ACCESS DENIED: ${email} is not authorized. Only @gtisec.com accounts are permitted.`);
        }
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const u = session.user;
        const email = u.email || '';
        if (validateDomain(email)) {
          setUser({
            name: u.user_metadata?.full_name || email.split('@')[0] || 'GTIS Security Officer',
            email: email,
            avatar: u.user_metadata?.avatar_url,
          });
          setViewMode('chat');
          setAuthError(null);
        } else {
          // Reject unauthorized domain
          supabase.auth.signOut();
          setUser(null);
          setViewMode('landing');
          setAuthError(`ACCESS DENIED: ${email} is not authorized. Only @gtisec.com accounts are permitted.`);
        }
      } else {
        setUser(null);
        setViewMode('landing');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? `${window.location.origin}` : undefined,
          queryParams: {
            hd: ALLOWED_DOMAIN, // Google hosted domain restriction
          },
        },
      });

      if (error) {
        console.warn('Supabase Google OAuth Notice:', error.message);
        setAuthError(`Google Auth Notice: ${error.message}`);
      }
    } catch (err) {
      console.error('Google Sign-In Error:', err);
      setAuthError('An error occurred during Google Authentication.');
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Sign out notice:', e);
    }
    setUser(null);
    setViewMode('landing');
    setAuthError(null);
  };

  if (user && viewMode === 'chat') {
    return (
      <ChatInterface
        user={user}
        onLogout={handleLogout}
        onBackToLanding={() => setViewMode('landing')}
      />
    );
  }

  return (
    <div className="page-wrapper">
      {/* Domain Access Error Alert Banner */}
      {authError && (
        <div
          style={{
            backgroundColor: '#e74c3c',
            color: '#ffffff',
            padding: '12px 24px',
            fontSize: '13px',
            fontFamily: 'var(--font-mono)',
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontWeight: '500',
            zIndex: 200,
          }}
        >
          <span>⚠️ {authError}</span>
          <button
            onClick={() => setAuthError(null)}
            style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '14px' }}
          >
            ✕
          </button>
        </div>
      )}

      <Navbar
        user={user}
        onOpenGoogleLogin={() => setGoogleModalOpen(true)}
        onOpenChat={() => setViewMode('chat')}
        onLogout={handleLogout}
      />

      <HeroSection
        user={user}
        onOpenGoogleLogin={() => setGoogleModalOpen(true)}
        onOpenChat={() => setViewMode('chat')}
      />

      <GoogleLoginModal
        isOpen={googleModalOpen}
        onClose={() => setGoogleModalOpen(false)}
        onGoogleSignIn={handleGoogleSignIn}
      />
    </div>
  );
}
