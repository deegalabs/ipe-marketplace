import { Route, Switch, Link, useLocation } from 'wouter';
import { usePrivy } from '@privy-io/react-auth';
import { Shop } from './pages/Shop';
import { ProductPage } from './pages/Product';
import { Orders } from './pages/Orders';
import { Admin } from './pages/Admin';
import { CurrencyToggle } from './lib/currency';
import { InstallPrompt } from './components/InstallPrompt';

export function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 sm:py-8 pb-24 sm:pb-12">
        <Switch>
          <Route path="/" component={Shop} />
          <Route path="/product/:id" component={ProductPage} />
          <Route path="/orders" component={Orders} />
          <Route path="/admin" component={Admin} />
          <Route>
            <p className="text-center text-ipe-ink/60">Page not found.</p>
          </Route>
        </Switch>
      </main>
      <BottomNav />
      <InstallPrompt />
      <footer className="hidden sm:block text-center text-xs text-ipe-ink/50 py-6">
        IPE Store · onchain on Base · merch by ipê.city
      </footer>
    </div>
  );
}

function Header() {
  const { authenticated, login, logout, user } = usePrivy();
  const wallet = user?.wallet?.address;

  return (
    <header
      className="border-b border-ipe-green/10 bg-white/80 backdrop-blur sticky top-0 z-20"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between sm:gap-6">
          <Link href="/" className="font-display font-bold text-ipe-green text-lg tracking-tight">
            IPE Store
          </Link>
          {/* Inline nav links visible only on desktop; mobile uses BottomNav. */}
          <nav className="hidden sm:flex gap-4 text-sm">
            <Link href="/" className="hover:text-ipe-green">Shop</Link>
            <Link href="/orders" className="hover:text-ipe-green">My orders</Link>
            <Link href="/admin" className="hover:text-ipe-green">Admin</Link>
          </nav>
          {/* On mobile, the connect button sits next to the brand. */}
          <div className="sm:hidden">
            {authenticated && wallet ? (
              <button onClick={() => logout()} className="text-xs text-ipe-green/70">
                {wallet.slice(0, 4)}…{wallet.slice(-3)}
              </button>
            ) : (
              <button onClick={() => login()} className="btn-primary text-xs px-3 py-1.5">
                Connect
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <CurrencyToggle />
          {/* Desktop connect button stays in the header. */}
          <div className="hidden sm:block">
            {authenticated && wallet ? (
              <button onClick={() => logout()} className="btn-ghost text-xs">
                {wallet.slice(0, 6)}…{wallet.slice(-4)} · disconnect
              </button>
            ) : (
              <button onClick={() => login()} className="btn-primary">
                Connect
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

/// Native-feeling bottom nav for mobile. Hidden on desktop (≥sm) where the
/// header links cover the same routes.
function BottomNav() {
  const [pathname] = useLocation();
  const items = [
    { href: '/', label: 'Shop', icon: '🛍️' },
    { href: '/orders', label: 'Orders', icon: '🧾' },
    { href: '/admin', label: 'Admin', icon: '⚙️' },
  ];
  return (
    <nav
      className="sm:hidden fixed bottom-0 inset-x-0 z-20 bg-white border-t border-ipe-green/10"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="grid grid-cols-3">
        {items.map((it) => {
          const active = it.href === '/' ? pathname === '/' : pathname.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex flex-col items-center justify-center py-2 text-xs ${active ? 'text-ipe-green font-medium' : 'text-ipe-ink/60'}`}
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
