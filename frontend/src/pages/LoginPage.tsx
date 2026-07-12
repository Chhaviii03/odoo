import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api, ApiError } from '../lib/api';
import { toast } from '../lib/toast';

const DEMO = [
  { role: 'Admin', email: 'admin@assetflow.dev' },
  { role: 'Asset Manager', email: 'manager@assetflow.dev' },
  { role: 'Dept Head', email: 'head@assetflow.dev' },
  { role: 'Employee', email: 'priya@assetflow.dev' },
];

type Mode = 'login' | 'signup' | 'forgot';

export default function LoginPage() {
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'forgot') {
        setDevResetUrl('');
        const result = await api<{ ok: boolean; message: string; resetUrl?: string }>('/auth/forgot-password', {
          method: 'POST',
          body: { email },
        });
        toast(result.message, 'success');
        if (result.resetUrl) {
          setDevResetUrl(result.resetUrl);
        }
        return;
      }
      if (mode === 'login') await login(email, password);
      else await signup(name, email, password);
      navigate('/');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Something went wrong', 'error');
    } finally {
      setBusy(false);
    }
  }

  function quickFill(demoEmail: string) {
    setMode('login');
    setEmail(demoEmail);
    setPassword('password123');
  }

  const title = mode === 'login' ? 'Login' : mode === 'signup' ? 'Sign up' : 'Forgot password';

  return (
    <div className="grid min-h-screen place-items-center bg-[#F8F9FA] p-4">
      <div className="w-full max-w-sm">
        <div className="card p-7">
          <div className="mb-5 flex flex-col items-center">
            <div className="grid h-12 w-12 place-items-center rounded-full border border-gray-300 bg-white text-sm font-bold text-primary">AF</div>
            <h1 className="mt-3 text-xl font-semibold text-gray-900">AssetFlow — {title}</h1>
            {mode === 'forgot' && (
              <p className="mt-2 text-center text-xs text-gray-600">Enter your account email and we’ll send a reset link.</p>
            )}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="label">Full name</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" required />
              </div>
            )}
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" required />
            </div>
            {mode !== 'forgot' && (
              <div>
                <label className="label">Password</label>
                <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
                {mode === 'login' && (
                  <button type="button" onClick={() => setMode('forgot')} className="mt-1 block w-full text-right text-xs text-gray-600 hover:text-primary">
                    Forgot password?
                  </button>
                )}
              </div>
            )}

            <button className="btn-primary w-full" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : mode === 'signup' ? 'Create Account' : 'Send reset link'}
            </button>
          </form>

          {mode === 'forgot' && devResetUrl && (
            <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              <p className="font-medium text-amber-800">Dev mode reset link</p>
              <p className="mt-1 text-gray-600">Email sending is off, so use this link directly:</p>
              <div className="mt-2 flex flex-col gap-2">
                <Link
                  to={devResetUrl.replace(/^https?:\/\/[^/]+/, '')}
                  className="btn-primary w-full"
                >
                  Open reset page →
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(devResetUrl);
                    toast('Reset link copied', 'success');
                  }}
                  className="w-full break-all rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-left text-[11px] text-gray-700 hover:border-primary"
                >
                  {devResetUrl}
                </button>
              </div>
            </div>
          )}

          <div className="mt-5 rounded-lg border border-gray-300 bg-gray-100 p-3 text-xs text-gray-600">
            {mode === 'login' ? (
              <>
                <p className="font-medium text-gray-800">New here?</p>
                <p className="mt-1">Sign up creates an <span className="font-medium text-gray-800">Employee</span> account — admin roles are assigned later, never at signup.</p>
                <button type="button" onClick={() => setMode('signup')} className="mt-2 text-primary hover:underline">Create an account →</button>
              </>
            ) : mode === 'signup' ? (
              <button type="button" onClick={() => setMode('login')} className="text-primary hover:underline">← Back to login</button>
            ) : (
              <button type="button" onClick={() => setMode('login')} className="text-primary hover:underline">← Back to login</button>
            )}
          </div>
        </div>

        {mode !== 'forgot' && (
          <div className="mt-4 card p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-600">Demo accounts (password123)</p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO.map((d) => (
                <button key={d.email} type="button" onClick={() => quickFill(d.email)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-xs hover:border-primary hover:bg-gray-100">
                  <span className="block font-medium text-gray-900">{d.role}</span>
                  <span className="block truncate text-gray-600">{d.email}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === 'forgot' && (
          <p className="mt-4 text-center text-xs text-gray-600">
            Prefer login? <Link to="/login" className="text-primary hover:underline" onClick={() => setMode('login')}>Go back</Link>
          </p>
        )}
      </div>
    </div>
  );
}
