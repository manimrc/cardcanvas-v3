/**
 * @file reset-password/page.tsx
 * @description Secure local-first password reset page.
 * Uses the client's cached 12-character Recovery Key payload to authorize password modification
 * without email loops or server-side OAuth requirements.
 */

'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, User, Eye, EyeOff, KeyRound, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (newPassword.length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }

    setLoading(true);

    try {
      await api.auth.resetPassword(username, recoveryCode, newPassword);

      setSuccess(true);
      setLoading(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setLoading(false);
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
          <h1 className="auth-headline">
            Recover your<br />
            <span className="auth-headline-accent">account.</span>
          </h1>
          <p className="auth-subtext">
            Enter the 12-character Recovery Key you saved during registration to securely reset your password locally.
          </p>
        </div>
      </div>

      <div className="auth-form-panel">
        <div className="auth-form-container">
          <div className="auth-form-icon">
            <KeyRound size={24} />
          </div>
          <h2 className="auth-form-title">Reset Password</h2>
          
          {success ? (
            <div style={{ textAlign: 'center', marginTop: 24 }}>
              <div style={{ color: 'var(--accent)', fontSize: 48, marginBottom: 16 }}>✓</div>
              <p style={{ marginBottom: 24, fontSize: 16 }}>Your password has been successfully reset!</p>
              <button onClick={() => router.push('/login')} className="auth-submit">
                Go to Login
                <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <>
              <p className="auth-form-subtitle">Use your Recovery Key to set a new password</p>
              <form onSubmit={handleSubmit} className="auth-form">
                <div className="auth-field">
                  <label className="auth-label">Username</label>
                  <div className="auth-input-wrap">
                    <User size={16} className="auth-input-icon" />
                    <input
                      type="text"
                      className="auth-input"
                      placeholder="Your username"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="auth-field">
                  <label className="auth-label">Recovery Key</label>
                  <div className="auth-input-wrap">
                    <KeyRound size={16} className="auth-input-icon" />
                    <input
                      type="text"
                      className="auth-input"
                      placeholder="XXXX-XXXX-XXXX"
                      value={recoveryCode}
                      onChange={e => setRecoveryCode(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="auth-field">
                  <label className="auth-label">New Password</label>
                  <div className="auth-input-wrap">
                    <Lock size={16} className="auth-input-icon" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="auth-input"
                      placeholder="Create a new password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      required
                      minLength={4}
                    />
                    <button
                      type="button"
                      className="auth-password-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {error && <div className="auth-error">{error}</div>}

                <button type="submit" className="auth-submit" disabled={loading}>
                  {loading ? <span className="auth-spinner" /> : 'Reset Password'}
                </button>
              </form>
              
              <div className="auth-switch">
                Remember your password?{' '}
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
