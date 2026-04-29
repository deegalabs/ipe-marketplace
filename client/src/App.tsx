import { Route, Switch, Link } from 'wouter';
import { usePrivy } from '@privy-io/react-auth';
import { Shop } from './pages/Shop';
import { ProductPage } from './pages/Product';
import { Orders } from './pages/Orders';
import { Admin } from './pages/Admin';

export function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
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
      <footer className="text-center text-xs text-ipe-ink/50 py-6">
        ipê.city marketplace · onchain on Base · paid in $IPE
      </footer>
    </div>
  );
}

function Header() {
  const { authenticated, login, logout, user } = usePrivy();
  const wallet = user?.wallet?.address;

  return (
    <header className="border-b border-ipe-green/10 bg-white/60 backdrop-blur sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-display font-bold text-ipe-green text-lg">
            ipê.city
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/" className="hover:text-ipe-green">Shop</Link>
            <Link href="/orders" className="hover:text-ipe-green">My orders</Link>
            <Link href="/admin" className="hover:text-ipe-green">Admin</Link>
          </nav>
        </div>
        <div>
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
    </header>
  );
}
