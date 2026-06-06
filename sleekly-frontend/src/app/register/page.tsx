/**
 * @file register/page.tsx
 * @description Account creation page.
 * Creates credentials, stores session cookies, and displays the secret recovery key
 * which is critical for future password recoveries.
 */

'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, User, Eye, EyeOff, UserPlus, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth, type User as AuthUser } from '@/components/AuthContext';

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [pendingUser, setPendingUser] = useState<AuthUser | null>(null);

  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const data = await api.auth.register(username, password, displayName || username);

      if (data.recoveryCode) {
        setRecoveryCode(data.recoveryCode);
        setPendingUser({
          id: data.user.id,
          username: data.user.username,
          displayName: data.user.displayName,
        });
        setLoading(false);
        return;
      }

      login({ id: data.user.id, username: data.user.username, displayName: data.user.displayName });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  const handleContinue = () => {
    if (pendingUser) {
      login(pendingUser);
    } else {
      router.push('/login');
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <div className="auth-hero-content">
          <div className="auth-brand">
            <div className="auth-brand-icon">📋</div>
            <span className="auth-brand-text">Sleekly</span>
          </div>
          <p className="auth-tagline">Organize. Visualize. Create.</p>
          <h1 className="auth-headline">
            Start building<br />
            <span className="auth-headline-accent">your creative<br />workspace today.</span>
          </h1>
          <p className="auth-subtext">
            Join Sleekly and organize your ideas with beautiful cards,
            boards, and an infinite whiteboard.
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

      <div className="auth-form-panel">
        <div className="auth-form-container">
          {recoveryCode ? (
            <div className="auth-recovery-view">
              <div className="auth-form-icon" style={{ background: 'var(--accent)', color: 'white' }}>
                <Lock size={24} />
              </div>
              <h2 className="auth-form-title">Save Your Recovery Key</h2>
              <p className="auth-form-subtitle">
                Keep this key safe! If you forget your password, this is the only way to recover your account.
              </p>
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '24px', margin: '24px 0', textAlign: 'center' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>Your Secret Recovery Key</div>
                <div style={{ fontFamily: 'monospace', fontSize: '24px', fontWeight: 'bold', color: 'var(--text-primary)', letterSpacing: '2px' }}>{recoveryCode}</div>
              </div>
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'rgb(239, 68, 68)', padding: '16px', borderRadius: '8px', fontSize: '14px', marginBottom: '24px', lineHeight: 1.5 }}>
                <strong>Warning:</strong> If you forget your password and lose this key, your data cannot be recovered.
              </div>
              <button type="button" className="auth-submit" onClick={handleContinue}>
                I have safely saved this key
                <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <>
              <div className="auth-form-icon"><UserPlus size={24} /></div>
              <h2 className="auth-form-title">Create account</h2>
              <p className="auth-form-subtitle">Get started with Sleekly</p>

              <form onSubmit={handleSubmit} className="auth-form">
                <div className="auth-field">
                  <label className="auth-label" htmlFor="reg-username">Username</label>
                  <div className="auth-input-wrap">
                    <User size={16} className="auth-input-icon" />
                    <input id="reg-username" type="text" className="auth-input" placeholder="Choose a username" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoFocus required minLength={3} />
                  </div>
                </div>
                <div className="auth-field">
                  <label className="auth-label" htmlFor="reg-displayname">Display Name <span className="auth-optional">(optional)</span></label>
                  <div className="auth-input-wrap">
                    <User size={16} className="auth-input-icon" />
                    <input id="reg-displayname" type="text" className="auth-input" placeholder="How should we call you?" value={displayName} onChange={e => setDisplayName(e.target.value)} />
                  </div>
                </div>
                <div className="auth-field">
                  <label className="auth-label" htmlFor="reg-password">Password</label>
                  <div className="auth-input-wrap">
                    <Lock size={16} className="auth-input-icon" />
                    <input id="reg-password" type={showPassword ? 'text' : 'password'} className="auth-input" placeholder="Create a password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required minLength={4} />
                    <button type="button" className="auth-password-toggle" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="auth-field">
                  <label className="auth-label" htmlFor="reg-confirm">Confirm Password</label>
                  <div className="auth-input-wrap">
                    <Lock size={16} className="auth-input-icon" />
                    <input id="reg-confirm" type={showPassword ? 'text' : 'password'} className="auth-input" placeholder="Repeat your password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" required minLength={4} />
                  </div>
                </div>
                {error && <div className="auth-error">{error}</div>}
                <button type="submit" className="auth-submit" disabled={loading}>
                  {loading ? <span className="auth-spinner" /> : <><span>Create account</span><ArrowRight size={16} /></>}
                </button>
              </form>
              <div className="auth-switch">
                Already have an account?{' '}
                <a href="/login" className="auth-switch-link">Sign in</a>
              </div>
            </>
          )}
        </div>
        <div className="auth-footer">
          © {new Date().getFullYear()} Sleekly. All rights reserved.
        </div>
      </div>
    </div>
  );
}
