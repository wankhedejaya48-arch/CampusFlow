import { useState } from 'react';
import { Eye, EyeOff, ArrowLeft, Mail, Lock, ChevronRight } from 'lucide-react';
import Logo from '../components/Logo';
import type { View } from '../types';
import { useCampusFlow } from '../context/CampusFlowContext';

interface LoginProps {
  onNavigate: (view: View) => void;
  onLogin: () => void;
}

export default function Login({ onNavigate, onLogin }: LoginProps) {
  const [showPass, setShowPass] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login, sessionBlocked, authLoading } = useCampusFlow();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    const result = await login(email, password);
    setSubmitting(false);
    if (!result.success) { setError(result.message ?? 'Unable to sign in.'); return; }
    setError('');
    onLogin();
  };

  return (
    <div className="min-h-screen flex bg-[#EEF4FF]">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col w-[45%] hero-gradient relative overflow-hidden p-10">
        <button
          className="text-blue-300 hover:text-white flex items-center gap-1.5 text-sm font-medium transition-colors mb-10"
          onClick={() => onNavigate('landing')}
        >
          <ArrowLeft size={16} />
          Back to Home
        </button>

        <div className="flex-1 flex flex-col justify-center">
          <Logo size="lg" variant="light" showTagline />
          <div className="mt-10 space-y-5">
            {[
              { icon: '📚', text: '12,400+ academic resources' },
              { icon: '🎓', text: 'Join classrooms with unique codes' },
              { icon: '✅', text: 'Teacher-verified content' },
              { icon: '⚡', text: 'Search by semester & subject' },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-3">
                <span className="text-xl">{item.icon}</span>
                <span className="text-blue-100 text-sm font-medium">{item.text}</span>
              </div>
            ))}
          </div>

          {/* Network visualization */}
          <div className="mt-12 bg-white/8 border border-white/15 rounded-2xl p-5">
            <p className="text-blue-300 text-[11px] font-semibold uppercase tracking-wider mb-3">
              Live Activity
            </p>
            <div className="space-y-2.5">
              {[
                { action: 'uploaded', resource: 'ML Lab Manual Exp 5', user: 'Prof. A. Desai', time: '2m ago' },
                { action: 'downloaded', resource: 'DBMS Question Papers', user: 'Sneha J.', time: '5m ago' },
                { action: 'requested', resource: 'CN Practicals PDF', user: 'Rahul V.', time: '12m ago' },
              ].map((a) => (
                <div key={a.resource} className="flex items-center gap-2 text-[11px] text-blue-200">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="font-medium">{a.user}</span>
                  <span className="text-blue-400">{a.action}</span>
                  <span className="truncate text-blue-300">{a.resource}</span>
                  <span className="ml-auto text-blue-500 flex-shrink-0">{a.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-5">
        <div className="w-full max-w-[420px]">
          <div className="lg:hidden mb-6 flex items-center justify-between">
            <Logo size="sm" variant="dark" />
            <button
              className="text-slate-400 hover:text-slate-600 flex items-center gap-1 text-sm"
              onClick={() => onNavigate('landing')}
            >
              <ArrowLeft size={14} />
              Home
            </button>
          </div>

          <div className="card p-8">
            <div className="mb-7">
              <h1 className="text-2xl font-extrabold text-[#0F172A] tracking-tight">Welcome back!</h1>
              <p className="text-slate-500 text-sm mt-1">Sign in to access your academic resources.</p>
            </div>

            {/* Google Sign In */}
            <button type="button" disabled title="Google sign-in is not connected yet" className="w-full flex items-center justify-center gap-2.5 border-1.5 border-slate-200 rounded-xl py-2.5 text-sm font-semibold text-slate-400 bg-slate-50 cursor-not-allowed mb-5">
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Google Sign-In · Coming soon
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-slate-100" />
              <span className="text-xs text-slate-400 font-medium">or sign in with email</span>
              <div className="flex-1 h-px bg-slate-100" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Email Address</label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    className="input-field pl-9"
                    placeholder="you@campus.edu"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="label mb-0">Password</label>
                  <button type="button" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    className="input-field pl-9 pr-10"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(''); }}
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    onClick={() => setShowPass(!showPass)}
                  >
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {(error || sessionBlocked) && <p role="alert" className="text-sm text-red-600">{error || 'This account was disabled. Sign in with an active account or contact an administrator.'}</p>}
              <div className="flex items-center gap-2">
                <input
                  id="remember"
                  type="checkbox"
                  checked
                  readOnly
                  className="w-4 h-4 rounded border-slate-300 accent-blue-600"
                />
                <label htmlFor="remember" className="text-sm text-slate-600 cursor-pointer">
                  Keep me signed in for this tab
                </label>
              </div>

              <button type="submit" disabled={submitting || authLoading} className="btn-primary w-full justify-center py-3 text-base rounded-xl disabled:opacity-60">
                {submitting ? 'Signing in…' : authLoading ? 'Restoring session…' : 'Sign In'}
                <ChevronRight size={16} />
              </button>
            </form>

            <p className="text-center text-sm text-slate-500 mt-5">
              Don't have an account?{' '}
              <button
                className="text-blue-600 font-semibold hover:text-blue-700"
                onClick={() => onNavigate('register')}
              >
                Create Account
              </button>
            </p>
          </div>

          <p className="mt-4 text-center text-xs text-slate-500">Use a registered CampusFlow account.</p>
        </div>
      </div>
    </div>
  );
}
