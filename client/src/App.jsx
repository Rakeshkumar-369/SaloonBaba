import { lazy, Suspense } from 'react';
import { RouterProvider, Routes, navigate, useLocation, Redirect } from './lib/router.jsx';
import { AuthProvider, useAuth, HOME } from './lib/auth.jsx';
import { ToastProvider, Button, Empty } from './ui/kit.jsx';
import { PayProvider } from './ui/DemoPay.jsx';

// Every app is its own chunk: a stylist never downloads the franchise console.
const Landing = lazy(() => import('./apps/public/Landing.jsx'));
const Login = lazy(() => import('./apps/public/Login.jsx'));
const Bill = lazy(() => import('./apps/public/Bill.jsx'));
const Verify = lazy(() => import('./apps/public/Verify.jsx'));
const CustomerApp = lazy(() => import('./apps/customer/CustomerApp.jsx'));
const SalonApp = lazy(() => import('./apps/salon/SalonApp.jsx'));
const StaffApp = lazy(() => import('./apps/staff/StaffApp.jsx'));
const FranchiseApp = lazy(() => import('./apps/franchise/FranchiseApp.jsx'));
const VendorApp = lazy(() => import('./apps/vendor/VendorApp.jsx'));
const AdminApp = lazy(() => import('./apps/admin/AdminApp.jsx'));

export const PageLoader = () => (
  <div className="center-page"><div className="spinner" /></div>
);

/** Only render children for allowed roles; otherwise send to login or the user's own app. */
function Guard({ roles, children }) {
  const { user, loading } = useAuth();
  const { path, search } = useLocation();
  if (loading) return <PageLoader />;
  if (!user) return <Redirect to={`/login?next=${encodeURIComponent(path + search)}`} />;
  if (!roles.includes(user.role) && user.role !== 'admin') {
    return (
      <div className="page">
        <Empty icon="lock" title="This area is for another type of account">
          You are logged in as <b>{user.role.replace('_', ' ')}</b>.
        </Empty>
        <div className="center"><Button onClick={() => navigate(HOME[user.role])}>Go to my app</Button></div>
      </div>
    );
  }
  return children;
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes
        routes={[
          ['/', () => <Landing />],
          ['/login', () => <Login />],
          ['/signup', () => <Login mode="signup" />],
          ['/bill/:token', (p) => <Bill token={p.token} />],
          ['/verify/:code?', (p) => <Verify code={p.code} />],
          ['/s/:slug', (p) => <Redirect to={`/app/s/${p.slug}${location.search}`} />],
          ['/app/*', () => <CustomerApp />],
          ['/app', () => <CustomerApp />],
          ['/salon/*', () => <Guard roles={['owner', 'manager']}><SalonApp /></Guard>],
          ['/salon', () => <Guard roles={['owner', 'manager']}><SalonApp /></Guard>],
          ['/staff/*', () => <Guard roles={['stylist', 'manager']}><StaffApp /></Guard>],
          ['/staff', () => <Guard roles={['stylist', 'manager']}><StaffApp /></Guard>],
          ['/franchise/*', () => <Guard roles={['franchisor', 'area_manager']}><FranchiseApp /></Guard>],
          ['/franchise', () => <Guard roles={['franchisor', 'area_manager']}><FranchiseApp /></Guard>],
          ['/vendor/*', () => <Guard roles={['vendor']}><VendorApp /></Guard>],
          ['/vendor', () => <Guard roles={['vendor']}><VendorApp /></Guard>],
          ['/admin/*', () => <Guard roles={['admin']}><AdminApp /></Guard>],
          ['/admin', () => <Guard roles={['admin']}><AdminApp /></Guard>],
        ]}
        fallback={<div className="page"><Empty icon="map" title="Page not found" /><div className="center"><Button onClick={() => navigate('/')}>Go home</Button></div></div>}
      />
    </Suspense>
  );
}

export default function App() {
  return (
    <RouterProvider>
      <ToastProvider>
        <AuthProvider>
          <PayProvider>
            <AppRoutes />
          </PayProvider>
        </AuthProvider>
      </ToastProvider>
    </RouterProvider>
  );
}
