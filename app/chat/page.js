'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ChatInterface from '../../components/ChatInterface';
import { supabase } from '../../lib/supabaseClient';
import { validateDomain, formatUserData } from '../../lib/authHelper';

export default function ChatPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    // 1. Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;

      if (session?.user) {
        const u = session.user;
        const email = u.email || '';
        if (validateDomain(email)) {
          setUser(formatUserData(u));
          setLoading(false);
          if (typeof window !== 'undefined' && window.location.hash) {
            window.history.replaceState(null, '', window.location.pathname + (window.location.search || ''));
          }
        } else {
          supabase.auth.signOut();
          setUser(null);
          router.replace('/?error=unauthorized');
        }
      } else {
        router.replace('/');
      }
    });

    // 2. Real-time auth listener (sign-in, token refresh, sign-out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;

      if (session?.user) {
        const u = session.user;
        const email = u.email || '';
        if (validateDomain(email)) {
          setUser(formatUserData(u));
          setLoading(false);
          if (typeof window !== 'undefined' && window.location.hash) {
            window.history.replaceState(null, '', window.location.pathname + (window.location.search || ''));
          }
        } else {
          supabase.auth.signOut();
          setUser(null);
          router.replace('/?error=unauthorized');
        }
      } else {
        setUser(null);
        router.replace('/');
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, [router]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Sign out notice:', e);
    }
    setUser(null);
    router.replace('/');
  };

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          width: '100vw',
          backgroundColor: '#0a0d14',
          color: '#f8fafc',
          fontFamily: 'var(--font-sans, system-ui, sans-serif)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            padding: '16px 24px',
            borderRadius: '12px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          }}
        >
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              border: '2px solid rgba(0, 102, 255, 0.25)',
              borderTopColor: '#0066ff',
              animation: 'spin 0.75s linear infinite',
            }}
          />
          <span
            style={{
              fontSize: '14px',
              fontWeight: '500',
              letterSpacing: '-0.01em',
              color: '#94a3b8',
            }}
          >
            Verifying GTIS security credentials...
          </span>
        </div>
        <style jsx>{`
          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <ChatInterface
      user={user}
      onLogout={handleLogout}
      onBackToLanding={() => router.push('/?landing=true')}
    />
  );
}
