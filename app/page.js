'use client';

import { useState, useEffect } from 'react';
import AnnouncementBar from '../components/AnnouncementBar';
import Navbar from '../components/Navbar';
import HeroSection from '../components/HeroSection';
import SocialProof from '../components/SocialProof';
import ServicesSection from '../components/ServicesSection';
import ProcessPipeline from '../components/ProcessPipeline';
import ResultsMetrics from '../components/ResultsMetrics';
import FaqAccordion from '../components/FaqAccordion';
import FinalCta from '../components/FinalCta';
import Footer from '../components/Footer';
import GoogleLoginModal from '../components/GoogleLoginModal';
import ChatInterface from '../components/ChatInterface';
import { supabase } from '../lib/supabaseClient';

export default function Home() {
  const [showAnnouncement, setShowAnnouncement] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState(null);
  const [activeProcessNode, setActiveProcessNode] = useState(0);
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

  const toggleFaq = (index) => {
    setActiveFaq(activeFaq === index ? null : index);
  };

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

  const processNodes = [
    {
      num: '01',
      title: 'ASSESS',
      detail: 'Deep technical audit of surface attack vectors, credential exposure, shadow IT, network vulnerability baselines, and competitor threat profiles.'
    },
    {
      num: '02',
      title: 'ISOLATE',
      detail: 'Implementation of granular micro-segmentation, identity access management (IAM) policies, zero-trust perimeters, and end-to-end encrypted tunnels.'
    },
    {
      num: '03',
      title: 'DEPLOY',
      detail: 'Rapid activation of lightweight autonomous AI threat sensors, real-time playbook triggers, and 24/7 SOC telemetry integration.'
    },
    {
      num: '04',
      title: 'DEFEND',
      detail: 'Real-time threat correlation, behavioral intrusion hunting, and automated self-healing patch deployment across all enterprise endpoints.'
    },
    {
      num: '05',
      title: 'VERIFY',
      detail: 'Transparent executive security reporting. Real-time telemetry dashboards tracking Mean Time to Respond (MTTR), threat containment, and SOC 2 compliance.'
    }
  ];

  const faqs = [
    {
      question: "How quickly can GTIS deploy threat protection across our infrastructure?",
      answer: "Agentless cloud security monitoring activates in under 30 minutes. Full endpoint telemetry, zero-trust enforcement, and 24/7 SOC integration complete within 24 to 48 hours without operational downtime."
    },
    {
      question: "What makes GTIS's cybersecurity editorial approach unique?",
      answer: "We treat cybersecurity as an exact engineering discipline typeset with absolute clarity. No vendor bloatware, no false-positive alarm fatigue—just autonomous AI threat defense, hardened encryption, and transparent risk math."
    },
    {
      question: "How do you structure client engagements and enterprise pricing?",
      answer: "We provide flat monthly enterprise retainers based on endpoint scale and required SOC tier. Every contract starts with a complimentary 30-minute security audit to establish baseline exposure metrics before signing."
    },
    {
      question: "Will our team collaborate directly with senior cybersecurity engineers?",
      answer: "Yes. You work directly with senior SecOps engineers, threat intelligence researchers, and certified ethical hackers. We eliminate junior account managers and proxy support delays."
    },
    {
      question: "What is included in the free 30-minute cybersecurity audit?",
      answer: "We run an external attack surface scan, check dark web leak databases for compromised enterprise credentials, evaluate SSL/TLS configuration security, and deliver 3 actionable defense levers immediately."
    }
  ];

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
      <AnnouncementBar
        show={showAnnouncement}
        onClose={() => setShowAnnouncement(false)}
      />

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
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        user={user}
        onOpenGoogleLogin={() => setGoogleModalOpen(true)}
        onLogout={handleLogout}
      />

      <HeroSection
        user={user}
        onOpenGoogleLogin={() => {
          if (user) {
            setViewMode('chat');
          } else {
            setGoogleModalOpen(true);
          }
        }}
      />

      {/* 
        Below sections are preserved and can be enabled whenever desired.
      */}
      {/* 
      <SocialProof />
      <ServicesSection />
      <ProcessPipeline
        processNodes={processNodes}
        activeNode={activeProcessNode}
        setActiveNode={setActiveProcessNode}
      />
      <ResultsMetrics />
      <FaqAccordion
        faqs={faqs}
        activeFaq={activeFaq}
        toggleFaq={toggleFaq}
      />
      <FinalCta />
      <Footer />
      */}

      <GoogleLoginModal
        isOpen={googleModalOpen}
        onClose={() => setGoogleModalOpen(false)}
        onGoogleSignIn={handleGoogleSignIn}
      />
    </div>
  );
}
