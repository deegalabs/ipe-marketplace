import { Route, Switch, Link, useLocation } from 'wouter';
import { usePrivy } from '@privy-io/react-auth';
import { useQuery } from '@tanstack/react-query';
import { Shop } from './pages/Shop';
import { ProductPage } from './pages/Product';
import { Orders } from './pages/Orders';
import { Admin } from './pages/Admin';
import { CurrencyToggle } from './lib/currency';
import { InstallPrompt } from './components/InstallPrompt';
import { Logo } from './components/Logo';
import { ThemeToggle } from './components/ThemeToggle';
import { api } from './api';

export function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 sm:py-10 pb-24 sm:pb-12 motion-in">
        <Switch>
          <Route path="/" component={Shop} />
          <Route path="/product/:id" component={ProductPage} />
          <Route path="/orders" component={Orders} />
          <Route path="/admin">{() => <AdminGate />}</Route>
          <Route>
            <p className="text-center text-ipe-ink-50">Page not found.</p>
          </Route>
        </Switch>
      </main>
      <BottomNav />
      <InstallPrompt />
      <footer className="hidden sm:block text-center text-2xs text-ipe-ink-30 py-8 tracking-wide">
        IPE STORE · ONCHAIN ON BASE · MERCH BY IPÊ.CITY
      </footer>
    </div>
  );
}

function Header() {
  const { authenticated, login, logout, user } = usePrivy();
  const wallet = user?.wallet?.address;

  return (
    <header
      className="glass border-b border-ipe-stone-200/60 sticky top-0 z-20"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between sm:gap-8">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <Logo />
          </Link>
          {/* Inline nav links visible only on desktop; mobile uses BottomNav */}
          <nav className="hidden sm:flex gap-6 text-sm font-medium">
            <NavLink href="/" label="Shop" />
            <NavLink href="/orders" label="My orders" />
            <NavLink href="/admin" label="Admin" />
          </nav>
          {/* On mobile, the connect button sits next to the brand */}
          <div className="sm:hidden">
            {authenticated && wallet ? (
              <button onClick={() => logout()} className="text-2xs font-mono text-ipe-green-700 px-2.5 py-1 rounded-xs bg-ipe-green-100">
                {wallet.slice(0, 4)}…{wallet.slice(-3)}
              </button>
            ) : (
              <button onClick={() => login()} className="btn-primary text-xs px-3 py-1.5 min-h-0">
                Connect
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <CurrencyToggle />
          {/* Desktop connect button stays in the header */}
          <div className="hidden sm:block">
            {authenticated && wallet ? (
              <button onClick={() => logout()} className="btn-ghost text-xs min-h-0 py-1.5">
                {wallet.slice(0, 6)}…{wallet.slice(-4)} · disconnect
              </button>
            ) : (
              <button onClick={() => login()} className="btn-primary text-sm min-h-0 py-2">
                Connect
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  const [pathname] = useLocation();
  const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={`relative transition-colors duration-250 ease-smooth ${
        active ? 'text-ipe-green-700' : 'text-ipe-ink-70 hover:text-ipe-green-600'
      }`}
    >
      {label}
      {active && <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-ipe-gold-DEFAULT rounded-full" />}
    </Link>
  );
}

/// /admin gate based on Privy + the server-side allowlist. Three states:
///   - not logged in via Privy → CTA to use the Connect button
///   - logged in but not in admin_emails → friendly "no access" message
///   - admin → render dashboard
function AdminGate() {
  const { authenticated, ready, login, user } = usePrivy();
  const meQ = useQuery({
    queryKey: ['admin-me'],
    queryFn: api.adminMe,
    enabled: ready && authenticated,
    retry: false,
  });

  if (!ready) return <p className="text-ipe-ink-50">Loading…</p>;

  if (!authenticated) {
    return (
      <section className="max-w-md mx-auto py-16 text-center space-y-5 motion-in">
        <h1 className="text-hero font-display text-ipe-green-600">Admin</h1>
        <p className="text-ipe-ink-70">
          Sign in with your email or wallet to access the admin dashboard.
        </p>
        <button onClick={() => login()} className="btn-primary">Sign in with Privy</button>
      </section>
    );
  }

  if (meQ.isLoading) return <p className="text-ipe-ink-50">Checking access…</p>;

  if (meQ.isError) {
    const email = user?.email?.address;
    const msg = String((meQ.error as Error)?.message ?? '');
    const isForbidden = msg.includes('not an admin') || msg === '403';
    if (isForbidden) {
      return (
        <section className="max-w-md mx-auto py-16 text-center space-y-3 motion-in">
          <h1 className="text-2xl font-bold text-ipe-green-600">No admin access</h1>
          <p className="text-ipe-ink-70 text-sm">
            {email ? <>The email <code className="font-mono text-xs">{email}</code> isn't on the admin allowlist.</> : 'Your account is not on the admin allowlist.'}
          </p>
          <p className="text-ipe-ink-50 text-xs">
            Ask another admin to add your email, or sign out and try a different account.
          </p>
        </section>
      );
    }
    return (
      <section className="max-w-md mx-auto py-16 text-center space-y-3 motion-in">
        <h1 className="text-2xl font-bold text-ipe-green-600">Auth check failed</h1>
        <p className="text-ipe-ink-70 text-sm">{msg || 'unknown error'}</p>
        <p className="text-ipe-ink-50 text-xs">
          Likely a server config issue (missing or wrong PRIVY_APP_SECRET). Check the Railway logs.
        </p>
      </section>
    );
  }

  return <Admin />;
}

/// Native-feeling bottom nav for mobile. Hidden on desktop (≥sm) where the
/// header links cover the same routes.
function BottomNav() {
  const [pathname] = useLocation();
  const items = [
    { href: '/', label: 'Shop', icon: '🛍' },
    { href: '/orders', label: 'Orders', icon: '🧾' },
    { href: '/admin', label: 'Admin', icon: '⚙' },
  ];
  return (
    <nav
      className="sm:hidden fixed bottom-0 inset-x-0 z-20 glass border-t border-ipe-stone-200/60"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="grid grid-cols-3">
        {items.map((it) => {
          const active = it.href === '/' ? pathname === '/' : pathname.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex flex-col items-center justify-center py-2.5 text-2xs transition-colors duration-250 ease-smooth ${
                active ? 'text-ipe-green-700 font-semibold' : 'text-ipe-ink-50'
              }`}
            >
              <span className="text-lg leading-none mb-0.5">{it.icon}</span>
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
