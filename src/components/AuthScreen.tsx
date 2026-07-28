import { useState, useRef } from 'react';
import { MessageSquare, Mail, ArrowLeft } from 'lucide-react';
import { supabase } from '@/supabaseClient';

interface AuthScreenProps {
  onAuthed: () => void;
}

type Stage = 'credentials' | 'otp';

export default function AuthScreen({ onAuthed }: AuthScreenProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [stage, setStage] = useState<Stage>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) {
          onAuthed();
          return;
        }
        setStage('otp');
        setInfo('We sent a 6-digit code to your email. Enter it below to verify your account.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onAuthed();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const next = [...otp];
    next[index] = value;
    setOtp(next);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      const next = pasted.split('').concat(Array(6 - pasted.length).fill(''));
      setOtp(next);
      otpRefs.current[Math.min(pasted.length, 5)]?.focus();
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const code = otp.join('');
      if (code.length !== 6) {
        setError('Please enter all 6 digits.');
        setLoading(false);
        return;
      }
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'signup',
      });
      if (error) throw error;
      onAuthed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed. Check your code and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      if (error) throw error;
      setInfo('A new code has been sent to your email.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend code.');
    } finally {
      setLoading(false);
    }
  };

  const resetToCredentials = () => {
    setStage('credentials');
    setOtp(['', '', '', '', '', '']);
    setError(null);
    setInfo(null);
  };

  const switchMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    resetToCredentials();
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-blue-50 px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-blue-500 flex items-center justify-center mb-3 shadow-sm">
            <MessageSquare className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-800">
            {stage === 'otp'
              ? 'Verify your email'
              : mode === 'signin'
              ? 'Welcome back'
              : 'Create your account'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {stage === 'otp'
              ? 'Enter the code we sent to your email'
              : mode === 'signin'
              ? 'Sign in to continue to your messages'
              : 'Sign up to start chatting'}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          {stage === 'credentials' ? (
            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="At least 6 characters"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {loading
                  ? 'Please wait...'
                  : mode === 'signin'
                  ? 'Sign in'
                  : 'Create account'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleOtpSubmit} className="space-y-5">
              <div className="flex justify-center mb-2">
                <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center">
                  <Mail className="w-6 h-6 text-blue-500" />
                </div>
              </div>

              {info && (
                <p className="text-sm text-slate-600 text-center bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                  {info}
                </p>
              )}

              <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    className="w-11 h-13 py-3 text-center text-lg font-semibold rounded-lg bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition"
                  />
                ))}
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || otp.join('').length !== 6}
                className="w-full py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {loading ? 'Verifying...' : 'Verify email'}
              </button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={resetToCredentials}
                  className="flex items-center gap-1 text-slate-500 hover:text-slate-700 transition"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={loading}
                  className="text-blue-600 font-medium hover:underline disabled:opacity-50"
                >
                  Resend code
                </button>
              </div>
            </form>
          )}

          {stage === 'credentials' && (
            <p className="text-sm text-slate-500 text-center mt-5">
              {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
              <button
                onClick={switchMode}
                className="text-blue-600 font-medium hover:underline"
              >
                {mode === 'signin' ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
