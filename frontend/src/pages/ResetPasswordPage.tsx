import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { toast } from '../lib/toast';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => params.get('token')?.trim() ?? '', [params]);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      toast('Missing reset token. Request a new link from the login page.', 'error');
      return;
    }
    if (password !== confirm) {
      toast('Passwords do not match', 'error');
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ message?: string }>('/auth/reset-password', {
        method: 'POST',
        body: { token, newPassword: password },
      });
      toast(result.message ?? 'Password updated', 'success');
      navigate('/login', { replace: true });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not reset password', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-ink-950 p-4">
      <div className="w-full max-w-sm">
        <div className="card p-7">
          <div className="mb-5 flex flex-col items-center">
            <div className="grid h-12 w-12 place-items-center rounded-full border border-ink-600 text-sm font-bold text-white">AF</div>
            <h1 className="mt-3 text-xl font-semibold text-white">Set a new password</h1>
            <p className="mt-2 text-center text-xs text-slate-400">Choose a new password for your AssetFlow account.</p>
          </div>

          {!token ? (
            <div className="space-y-4 text-sm text-slate-300">
              <p>This reset link is missing or invalid.</p>
              <Link to="/login" className="btn-primary inline-flex w-full">Back to login</Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="label">New password</label>
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="••••••••"
                  autoFocus
                />
              </div>
              <div>
                <label className="label">Confirm password</label>
                <input
                  className="input"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={6}
                  placeholder="••••••••"
                />
              </div>
              <button className="btn-primary w-full" disabled={busy}>
                {busy ? 'Updating…' : 'Update password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
