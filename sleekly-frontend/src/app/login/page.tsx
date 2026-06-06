/**
 * @file login/page.tsx
 * @description Authentication page for existing users to sign in.
 * Validates credentials against the backend API and calls context logins to trigger redirect guards.
 */

'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthContext';
import { api } from '@/lib/api';
import { Lock, Eye, EyeOff, User, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await api.auth.login(username, password);
      login({ id: user.id, username: user.username, displayName: user.displayName });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Left Panel — Hero */}
      <div className="auth-hero">
        <div className="auth-hero-content">
          <div className="auth-brand">
            <div className="auth-brand-icon">📋</div>
            <span className="auth-brand-text">Sleekly</span>
          </div>
          <p className="auth-tagline">Organize. Visualize. Create.</p>

          <h1 className="auth-headline">
            Your ideas,<br />
            <span className="auth-headline-accent">organized on<br />beautiful boards.</span>
          </h1>
          <p className="auth-subtext">
            Create boards, add cards with notes, links, images, PDFs and more.
            Keep everything structured, visual and easy to find.
          </p>

          <div className="auth-illustration">
            <div className="auth-float-card auth-float-1">
              <div className="auth-float-card-header">
                <span className="auth-float-dot" style={{ background: '#7c5cfc' }} />
                <span>Product Roadmap</span>
                <span className="auth-float-dots">•••</span>
              </div>
              <div className="auth-float-card-body">
                <div className="auth-float-line" style={{ width: '80%' }} />
                <div className="auth-float-line" style={{ width: '60%' }} />
                <div className="auth-float-line" style={{ width: '70%' }} />
              </div>
            </div>
            <div className="auth-float-card auth-float-2" style={{ background: '#FFF9C4' }}>
              <div className="auth-float-card-header"><span>📝 Note</span></div>
              <div className="auth-float-card-body">
                <div className="auth-float-check">✓ Authentication</div>
                <div className="auth-float-check">✓ Design System</div>
                <div className="auth-float-check unchecked">○ Analytics</div>
              </div>
            </div>
            <div className="auth-float-card auth-float-3" style={{ background: '#BBDEFB' }}>
              <div className="auth-float-card-header"><span>🔗 Link</span></div>
              <div className="auth-float-card-body">
                <div className="auth-float-line" style={{ width: '90%', background: '#64b5f6' }} />
                <div className="auth-float-line" style={{ width: '50%' }} />
              </div>
            </div>
          </div>

          <div className="auth-features">
            <div className="auth-feature-pill">
              <span className="auth-feature-icon">📁</span>
              <div><strong>Boards</strong><span>Organize your workspaces</span></div>
            </div>
            <div className="auth-feature-pill">
              <span className="auth-feature-icon">🏷️</span>
              <div><strong>Tags</strong><span>Find what you need instantly</span></div>
            </div>
            <div className="auth-feature-pill">
              <span className="auth-feature-icon">🎨</span>
              <div><strong>Colors</strong><span>Color-code and stay focused</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel — Login Form */}
      <div className="auth-form-panel">
        <div className="auth-form-container">
          <div className="auth-form-icon">
            <Lock size={24} />
          </div>
          <h2 className="auth-form-title">Welcome back!</h2>
          <p className="auth-form-subtitle">Sign in to continue to Sleekly</p>

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-field">
              <label className="auth-label" htmlFor="login-username">Username</label>
              <div className="auth-input-wrap">
                <User size={16} className="auth-input-icon" />
                <input
                  id="login-username"
                  type="text"
                  className="auth-input"
                  placeholder="your username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  required
                />
              </div>
            </div>

            <div className="auth-field">
              <div className="auth-label-row" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <label className="auth-label" htmlFor="login-password">Password</label>
                <Link href="/reset-password" style={{ fontSize: '12px', color: 'var(--accent)', textDecoration: 'none', position: 'relative', zIndex: 10 }}>Forgot password?</Link>
              </div>
              <div className="auth-input-wrap">
                <Lock size={16} className="auth-input-icon" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="auth-input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button type="button" className="auth-password-toggle" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && <div className="auth-error">{error}</div>}

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? <span className="auth-spinner" /> : <><span>Sign in</span><ArrowRight size={16} /></>}
            </button>
          </form>

          <div className="auth-switch">
            New to Sleekly?{' '}
            <a href="/register" className="auth-switch-link">Create an account</a>
          </div>
        </div>
        <div className="auth-footer">
          © {new Date().getFullYear()} Sleekly. All rights reserved.
        </div>
      </div>
    </div>
  );
}
