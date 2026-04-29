import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAdminAuth } from '../lib/adminAuth';

export function AdminLogin() {
  const { login, loading } = useAdminAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
      navigate('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'login failed');
    }
  }

  return (
    <section className="max-w-sm mx-auto py-8">
      <h1 className="text-2xl font-bold text-ipe-green">Admin sign in</h1>
      <p className="text-sm text-ipe-ink/60 mt-1 mb-6">Manage products, orders, and treasury.</p>
      <form className="space-y-3" onSubmit={submit}>
        <div>
          <label className="label">Email</label>
          <input
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Password</label>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </section>
  );
}
