import { createContext, useContext, useEffect, useState, type ReactNode, createElement } from 'react';
import { env } from '../config';

interface AdminSession {
  token: string;
  email: string;
  name: string;
}

interface AdminAuthCtx {
  session: AdminSession | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const KEY = 'ipe.admin.session';
const ctx = createContext<AdminAuthCtx | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AdminSession | null>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as AdminSession) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);

  // Validate token on mount — logs out if it's expired or revoked.
  useEffect(() => {
    if (!session) return;
    fetch(`${env.apiUrl}/admin/me`, {
      headers: { Authorization: `Bearer ${session.token}` },
    }).then((r) => {
      if (r.status === 401) {
        localStorage.removeItem(KEY);
        setSession(null);
      }
    });
  }, [session?.token]);

  async function login(email: string, password: string) {
    setLoading(true);
    try {
      const res = await fetch(`${env.apiUrl}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `login failed (${res.status})`);
      }
      const data = (await res.json()) as { token: string; email: string; name: string };
      const next: AdminSession = { token: data.token, email: data.email, name: data.name };
      localStorage.setItem(KEY, JSON.stringify(next));
      setSession(next);
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem(KEY);
    setSession(null);
  }

  return createElement(ctx.Provider, { value: { session, login, logout, loading } }, children);
}

export function useAdminAuth() {
  const v = useContext(ctx);
  if (!v) throw new Error('useAdminAuth must be inside AdminAuthProvider');
  return v;
}

/// Read-only helper for code outside React (e.g. fetch wrappers).
export function getAdminToken(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return (JSON.parse(raw) as AdminSession).token;
  } catch {
    return null;
  }
}
