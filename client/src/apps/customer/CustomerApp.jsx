import Shell from '../../ui/Shell.jsx';
import { Button } from '../../ui/kit.jsx';
import { Routes, navigate } from '../../lib/router.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { useT } from '../../lib/i18n.js';
import Discover from './Discover.jsx';
import SalonPage from './SalonPage.jsx';
import Bookings from './Bookings.jsx';
import Offers from './Offers.jsx';
import Wallet from './Wallet.jsx';
import Profile from './Profile.jsx';
import Shop from './Shop.jsx';
import Stylist from './Stylist.jsx';

export default function CustomerApp() {
  const t = useT();
  const { user } = useAuth();
  const nav = [
    { to: '/app', label: t('discover'), icon: 'search', primary: true },
    { to: '/app/bookings', label: t('bookings'), icon: 'calendar', primary: true },
    { to: '/app/offers', label: t('offers'), icon: 'gift', primary: true },
    { to: '/app/profile', label: t('profile'), icon: 'user', primary: true },
    { to: '/app/wallet', label: `${t('wallet')} & Gold`, icon: 'wallet' },
    { to: '/app/shop', label: t('shop'), icon: 'bag' },
  ];
  return (
    <Shell nav={nav} base="/app" title="SaloonBaba" langSwitch
      topExtra={!user && <Button size="sm" onClick={() => navigate(`/login?next=${encodeURIComponent(location.pathname)}`)}>Log in</Button>}>
      <Routes base="/app" routes={[
        ['', () => <Discover />],
        ['/s/:slug', (p) => <SalonPage slug={p.slug} />],
        ['/stylist/:id', (p) => <Stylist id={p.id} />],
        ['/bookings', () => <NeedLogin><Bookings /></NeedLogin>],
        ['/offers', () => <Offers />],
        ['/wallet', () => <NeedLogin><Wallet /></NeedLogin>],
        ['/profile', () => <NeedLogin><Profile /></NeedLogin>],
        ['/shop', () => <NeedLogin><Shop /></NeedLogin>],
      ]} fallback={<Discover />} />
    </Shell>
  );
}

export function NeedLogin({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user)
    return (
      <div className="page center-page">
        <div className="center col">
          <h2>Log in to continue</h2>
          <p className="muted">Your bookings, wallet and beauty profile are saved to your account.</p>
          <Button onClick={() => navigate(`/login?next=${encodeURIComponent(location.pathname)}`)}>Log in or sign up</Button>
        </div>
      </div>
    );
  return children;
}
