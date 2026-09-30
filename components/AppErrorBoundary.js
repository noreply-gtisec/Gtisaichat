'use client';

import { Component } from 'react';

// Top-level error boundary (PART 3.6): if anything in the chat interface throws,
// we show a friendly recovery card instead of a blank/crashed page.
export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Unexpected error' };
  }

  componentDidCatch(error, info) {
    console.error('Chat interface crashed:', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            gap: '16px',
            backgroundColor: '#0a0d14',
            color: '#f8fafc',
            fontFamily: 'var(--font-sans, system-ui, sans-serif)',
            padding: '24px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '40px' }}>⚠️</div>
          <h2 style={{ fontSize: '20px', margin: 0 }}>Something went wrong</h2>
          <p style={{ color: '#94a3b8', maxWidth: '420px', fontSize: '14px', margin: 0 }}>
            The chat interface hit an unexpected error. Your conversations are safe on the server —
            reload to continue.
          </p>
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button
              onClick={this.handleReset}
              style={{
                padding: '8px 18px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'transparent',
                color: '#f8fafc',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 18px',
                borderRadius: '8px',
                border: 'none',
                background: '#0066ff',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '600',
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
