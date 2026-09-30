'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';
import HeroSection from '../components/HeroSection';
import GoogleLoginModal from '../components/GoogleLoginModal';
import { supabase } from '../lib/supabaseClient';
import { ALLOWED_DOMAIN, validateDomain, formatUserData } from '../lib/authHelper';

export default function Home() {
  const router = useRouter();
  const [googleModalOpen, setGoogleModalOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState(null);

  // Supabase Auth session listener with @gtisec.com domain enforcement
  useEffect(() => {
    let isMounted = true;

    // Check if error parameter exists in URL (e.g. from /chat redirect)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('error') === 'unauthorized') {
        setAuthError(`ACCESS DENIED: Only @${ALLOWED_DOMAIN} accounts are permitted to access Zyra.`);
      }
    }

    const hasAuthCallback =
      typeof window !== 'undefined' &&
      (window.location.hash.includes('access_token') || window.location.search.includes('code'));

    const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const isLandingExplicit = searchParams?.get('landing') === 'true';

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;

      if (session?.user) {
        const u = session.user;
        const email = u.email || '';
        if (validateDomain(email)) {
          const userData = formatUserData(u);
          setUser(userData);
          setAuthError(null);

          // If returning from OAuth callback or not explicitly viewing landing, navigate to /chat
          if (hasAuthCallback || !isLandingExplicit) {
            router.replace('/chat');
          }
        } else {
          supabase.auth.signOut();
          setUser(null);
          setAuthError(`ACCESS DENIED: ${email} is not authorized. Only @${ALLOWED_DOMAIN} accounts are permitted.`);
        }
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;

      if (session?.user) {
        const u = session.user;
        const email = u.email || '';
        if (validateDomain(email)) {
          const userData = formatUserData(u);
          setUser(userData);
          setAuthError(null);

          if (event === 'SIGNED_IN' || hasAuthCallback || !isLandingExplicit) {
            router.replace('/chat');
          }
        } else {
          supabase.auth.signOut();
          setUser(null);
          setAuthError(`ACCESS DENIED: ${email} is not authorized. Only @${ALLOWED_DOMAIN} accounts are permitted.`);
        }
      } else {
        setUser(null);
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, [router]);

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    try {
      const redirectUrl =
        typeof window !== 'undefined' ? `${window.location.origin}/chat` : undefined;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
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
    setAuthError(null);
  };

  const handleOpenChat = () => {
    router.push('/chat');
  };

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
        onOpenChat={handleOpenChat}
        onLogout={handleLogout}
      />

      <HeroSection
        user={user}
        onOpenGoogleLogin={() => setGoogleModalOpen(true)}
        onOpenChat={handleOpenChat}
      />

      <GoogleLoginModal
        isOpen={googleModalOpen}
        onClose={() => setGoogleModalOpen(false)}
        onGoogleSignIn={handleGoogleSignIn}
      />
    </div>
  );
}
