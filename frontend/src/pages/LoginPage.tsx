import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { toast } from '../lib/toast';

const DEMO = [
  { role: 'Admin', email: 'admin@assetflow.dev' },
  { role: 'Asset Manager', email: 'manager@assetflow.dev' },
  { role: 'Dept Head', email: 'head@assetflow.dev' },
  { role: 'Employee', email: 'priya@assetflow.dev' },
];

export default function LoginPage() {
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
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

  return (
    <div className="grid min-h-screen place-items-center bg-ink-950 p-4">
      <div className="w-full max-w-sm">
        <div className="card p-7">
          <div className="mb-5 flex flex-col items-center">
            <div className="grid h-12 w-12 place-items-center rounded-full border border-ink-600 text-sm font-bold text-white">AF</div>
            <h1 className="mt-3 text-xl font-semibold text-white">AssetFlow — {mode === 'login' ? 'Login' : 'Sign up'}</h1>
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
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              {mode === 'login' && (
                <button type="button" onClick={() => toast('Password reset is available via the API in this demo.', 'info')} className="mt-1 block w-full text-right text-xs text-slate-400 hover:text-slate-200">
                  Forgot password?
                </button>
              )}
            </div>

            <button className="btn-primary w-full" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create Account'}
            </button>
          </form>

          <div className="mt-5 rounded-lg border border-ink-700 bg-ink-800/60 p-3 text-xs text-slate-400">
            {mode === 'login' ? (
              <>
                <p className="font-medium text-slate-300">New here?</p>
                <p className="mt-1">Sign up creates an <span className="text-slate-200">Employee</span> account — admin roles are assigned later, never at signup.</p>
                <button onClick={() => setMode('signup')} className="mt-2 text-accent-soft hover:underline">Create an account →</button>
              </>
            ) : (
              <button onClick={() => setMode('login')} className="text-accent-soft hover:underline">← Back to login</button>
            )}
          </div>
        </div>

        <div className="mt-4 card p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Demo accounts (password123)</p>
          <div className="grid grid-cols-2 gap-2">
            {DEMO.map((d) => (
              <button key={d.email} onClick={() => quickFill(d.email)} className="rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-left text-xs hover:border-accent">
                <span className="block font-medium text-slate-200">{d.role}</span>
                <span className="block truncate text-slate-500">{d.email}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
