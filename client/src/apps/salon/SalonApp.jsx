import { createContext, lazy, Suspense, useContext } from 'react';
import Shell from '../../ui/Shell.jsx';
import { Routes, navigate, useLocation, Redirect, match } from '../../lib/router.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { useApi } from '../../lib/api.js';
import { Empty, Loading } from '../../ui/kit.jsx';

const Dashboard = lazy(() => import('./Dashboard.jsx'));
const Calendar = lazy(() => import('./Calendar.jsx'));
const Billing = lazy(() => import('./Billing.jsx'));
const Clients = lazy(() => import('./Clients.jsx'));
const Marketing = lazy(() => import('./Marketing.jsx'));
const Inventory = lazy(() => import('./Inventory.jsx'));
const Staff = lazy(() => import('./Staff.jsx'));
const Finance = lazy(() => import('./Finance.jsx'));
const Insights = lazy(() => import('./Insights.jsx'));
const Loss = lazy(() => import('./Loss.jsx'));
const Checklists = lazy(() => import('./Checklists.jsx'));
const Reviews = lazy(() => import('./Reviews.jsx'));
const Packages = lazy(() => import('./Packages.jsx'));
const Approvals = lazy(() => import('./Approvals.jsx'));
const Messages = lazy(() => import('./Messages.jsx'));
const Settings = lazy(() => import('./Settings.jsx'));
const Rollup = lazy(() => import('./Rollup.jsx'));

const SalonCtx = createContext(null);
/** { id, salon, access, isOwner, base, go(path) } */
export const useSalon = () => useContext(SalonCtx);

export default function SalonApp() {
  const { salons = [] } = useAuth();
  const { path } = useLocation();
  const params = match('/salon/:id/*', path) || match('/salon/:id', path);
  const owned = salons.filter((s) => s.level === 'owner');
  if (!salons.length) return <div className="page"><Empty icon="store" title="No salon linked to this account" /></div>;
  if (!params) return <Redirect to={owned.length > 1 ? '/salon/rollup' : `/salon/${salons[0].id}`} />;
  if (params.id === 'rollup') return <RollupShell salons={salons} />;
  return <SalonScope id={Number(params.id)} salons={salons} />;
}

function Switcher({ salons, value }) {
  const owned = salons.filter((s) => s.level === 'owner');
  if (salons.length < 2) return null;
  return (
    <select className="input sm" style={{ width: 'auto', maxWidth: '46vw' }} value={value} aria-label="Switch outlet"
      onChange={(e) => navigate(e.target.value === 'rollup' ? '/salon/rollup' : `/salon/${e.target.value}`)}>
      {owned.length > 1 && <option value="rollup">All outlets</option>}
      {salons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
}

function RollupShell({ salons }) {
  const nav = [{ to: '/salon/rollup', label: 'All outlets', icon: 'layers', primary: true }, ...salons.map((s) => ({ to: `/salon/${s.id}`, label: s.name, icon: 'store', primary: true }))];
  return (
    <Shell nav={nav} base="/salon/rollup" title="All outlets" topExtra={<Switcher salons={salons} value="rollup" />}>
      <Suspense fallback={<div className="page"><Loading /></div>}><Rollup /></Suspense>
    </Shell>
  );
}

function SalonScope({ id, salons }) {
  const settings = useApi(`/salons/${id}/settings`);
  const base = `/salon/${id}`;
  const access = settings.data?.access;
  const isOwner = ['owner', 'admin'].includes(access);
  const all = [
    { to: base, label: 'Home', icon: 'home', primary: true, section: 'Today' },
    { to: `${base}/calendar`, label: 'Calendar & queue', icon: 'calendar', primary: true },
    { to: `${base}/billing`, label: 'Billing', icon: 'receipt', primary: true },
    { to: `${base}/clients`, label: 'Clients', icon: 'users', primary: true, section: 'Grow' },
    { to: `${base}/marketing`, label: 'Marketing', icon: 'megaphone' },
    { to: `${base}/reviews`, label: 'Reviews', icon: 'star' },
    { to: `${base}/packages`, label: 'Packages', icon: 'gift' },
    { to: `${base}/inventory`, label: 'Inventory', icon: 'box', section: 'Run' },
    { to: `${base}/staff`, label: 'Staff & payroll', icon: 'scissors' },
    { to: `${base}/checklists`, label: 'Hygiene & audits', icon: 'clipboard' },
    { to: `${base}/finance`, label: 'Finance & P&L', icon: 'wallet', section: 'Money' },
    { to: `${base}/insights`, label: 'Insights', icon: 'chart' },
    { to: `${base}/loss`, label: 'Loss prevention', icon: 'shield', owner: true },
    { to: `${base}/approvals`, label: 'Approvals', icon: 'checkCircle', owner: true },
    { to: `${base}/messages`, label: 'Messages', icon: 'message', section: 'Settings' },
    { to: `${base}/settings`, label: 'Settings', icon: 'settings' },
  ];
  const nav = all.filter((n) => !n.owner || isOwner);
  const current = salons.find((s) => s.id === id);
  const ctx = { id, salon: settings.data?.salon, brand: settings.data?.brand, access, isOwner, base, go: (p) => navigate(`${base}/${p}`), reloadSalon: settings.reload };
  if (settings.error) return <div className="page"><Empty icon="lock" title="You do not have access to this salon" /></div>;
  return (
    <SalonCtx.Provider value={ctx}>
      <Shell nav={nav} base={base} title={current?.name || 'Salon OS'} topExtra={<Switcher salons={salons} value={id} />}>
        {!settings.data ? <div className="page"><Loading /></div> : (
          <Suspense fallback={<div className="page"><Loading /></div>}>
            <Routes base={base} routes={[
              ['', () => <Dashboard />],
              ['/calendar', () => <Calendar />],
              ['/billing', () => <Billing />],
              ['/clients', () => <Clients />],
              ['/clients/:cid', (p) => <Clients clientId={Number(p.cid)} />],
              ['/marketing', () => <Marketing />],
              ['/inventory', () => <Inventory />],
              ['/staff', () => <Staff />],
              ['/finance', () => <Finance />],
              ['/insights', () => <Insights />],
              ['/loss', () => <Loss />],
              ['/checklists', () => <Checklists />],
              ['/reviews', () => <Reviews />],
              ['/packages', () => <Packages />],
              ['/approvals', () => <Approvals />],
              ['/messages', () => <Messages />],
              ['/settings', () => <Settings />],
            ]} fallback={<Dashboard />} />
          </Suspense>
        )}
      </Shell>
    </SalonCtx.Provider>
  );
}
