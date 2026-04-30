import type { ReactNode } from 'react';
import { Route, Switch, Link, useLocation } from 'wouter';
import { usePrivy } from '@privy-io/react-auth';
import { useQuery } from '@tanstack/react-query';
import { Shop } from './pages/Shop';
import { ProductPage } from './pages/Product';
import { Orders } from './pages/Orders';
import { Admin } from './pages/Admin';
import { InstallPrompt } from './components/InstallPrompt';
import { Logo, FlowerMark } from './components/Logo';
import { ThemeToggle } from './components/ThemeToggle';
import { ShopIcon, OrdersIcon } from './components/icons';
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
      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <footer className="hidden sm:block border-t border-ipe-stone-200/60 mt-12">
      <div className="max-w-6xl mx-auto px-4 py-10 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <FlowerMark className="text-ipe-gold" size={20} />
            <span className="font-display font-semibold text-ipe-ink tracking-tight">Ipê Store</span>
          </div>
          <p className="text-sm text-ipe-ink-70 max-w-xs">
            Community merch for ipê.city — every purchase recorded on Base, paid in any currency.
          </p>
        </div>
        <div className="space-y-2 text-sm">
          <p className="text-2xs uppercase tracking-widest text-ipe-ink-50 mb-3">Shop</p>
          <Link href="/" className="block text-ipe-ink-70 hover:text-ipe-green-700">All products</Link>
          <Link href="/orders" className="block text-ipe-ink-70 hover:text-ipe-green-700">My orders</Link>
        </div>
        <div className="space-y-2 text-sm">
          <p className="text-2xs uppercase tracking-widest text-ipe-ink-50 mb-3">Network</p>
          <a href="https://ipe.city" target="_blank" rel="noreferrer" className="block text-ipe-ink-70 hover:text-ipe-green-700">ipê.city ↗</a>
          <a href="https://base.org" target="_blank" rel="noreferrer" className="block text-ipe-ink-70 hover:text-ipe-green-700">Built on Base ↗</a>
        </div>
      </div>
      <div className="border-t border-ipe-stone-200/40">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row justify-between items-center gap-2 text-2xs text-ipe-ink-50">
          <span>© {new Date().getFullYear()} ipê.city · all rights reserved</span>
          <span className="font-mono">onchain receipts · paid in any currency</span>
        </div>
      </div>
    </footer>
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
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <Link href="/" className="hover:opacity-80 transition-opacity shrink-0" aria-label="Ipê Store home">
          <Logo height={28} />
        </Link>
        {/* Desktop nav links — mobile uses BottomNav */}
        <nav className="hidden sm:flex gap-6 text-sm font-medium ml-4 mr-auto">
          <NavLink href="/" label="Shop" />
          <NavLink href="/orders" label="My orders" />
        </nav>
        {/* Theme toggle + connect — same row on every breakpoint */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {authenticated && wallet ? (
            <button
              onClick={() => logout()}
              className="text-2xs sm:text-xs font-mono px-2.5 py-1.5 rounded-md bg-ipe-navy-100 text-ipe-navy-700 dark:bg-ipe-navy-700/40 dark:text-ipe-cream-100 hover:opacity-90 transition-opacity"
              title="Click to disconnect"
            >
              <span className="sm:hidden">{wallet.slice(0, 4)}…{wallet.slice(-3)}</span>
              <span className="hidden sm:inline">{wallet.slice(0, 6)}…{wallet.slice(-4)}</span>
            </button>
          ) : (
            <button
              onClick={() => login()}
              className="btn-primary text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 min-h-0"
            >
              Connect
            </button>
          )}
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
      {active && <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-ipe-gold rounded-full" />}
    </Link>
  );
}

/// /admin gate based on Privy + the server-side allowlist. Three states:
///   - not logged in via Privy → CTA to use the Connect button
///   - logged in but not in admin_emails → friendly "no access" message
///   - admin → render dashboard
function AdminGate({ children }: { children?: ReactNode }) {
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

  return <>{children ?? <Admin />}</>;
}

/// Native-feeling bottom nav for mobile. Hidden on desktop (≥sm) where the
/// header links cover the same routes. Admin is intentionally not here —
/// admins reach /admin by typing the URL.
function BottomNav() {
  const [pathname] = useLocation();
  const items = [
    { href: '/', label: 'Shop', Icon: ShopIcon },
    { href: '/orders', label: 'Orders', Icon: OrdersIcon },
  ];
  return (
    <nav
      className="sm:hidden fixed bottom-0 inset-x-0 z-20 glass border-t border-ipe-stone-200/60"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="grid grid-cols-2">
        {items.map((it) => {
          const active = it.href === '/' ? pathname === '/' : pathname.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`relative flex flex-col items-center justify-center py-3 gap-1 text-2xs font-medium transition-colors duration-250 ease-smooth ${
                active ? 'text-ipe-green-700' : 'text-ipe-ink-50 hover:text-ipe-ink-70'
              }`}
            >
              <it.Icon size={22} strokeWidth={active ? 2 : 1.6} />
              <span className="tracking-wide">{it.label}</span>
              {active && (
                <span className="absolute top-1 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-ipe-gold" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
