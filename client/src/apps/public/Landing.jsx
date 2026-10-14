import { useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { Button, Input, Select, Textarea, useAction, Badge } from '../../ui/kit.jsx';
import { navigate } from '../../lib/router.jsx';
import { useAuth, HOME } from '../../lib/auth.jsx';
import { post, useApi } from '../../lib/api.js';
import { inr } from '../../lib/format.js';

const PERSONAS = [
  {
    key: 'owner', cta: 'Try as owner', icon: 'chart', title: 'Salon owners', app: 'Salon OS', login: 'owner@maneroom.in',
    pain: 'Busy but not profitable — Saturday full, Tuesday empty, half the new clients never return.',
    points: ['KPI home: 2nd-visit return, rebooking %, utilisation, payroll %', 'Daily P&L after rent, EB, salary, product and royalty', 'Loss prevention: voids, discounts, cash variance, billed vs attended hours', 'Multi-outlet rollup'],
  },
  {
    key: 'manager', cta: 'Try as manager', icon: 'calendar', title: 'Salon managers', app: 'Salon OS (manager)', login: 'manager@glowcraft.in',
    pain: 'Running the floor on a paper register, three phones and memory.',
    points: ['One calendar for walk-ins, phone, WhatsApp, Instagram and app', 'Walk-in tokens with live ETA', 'GST bill on WhatsApp, split UPI/cash/card', 'Cash closing, stock counts, one-tap reorder'],
  },
  {
    key: 'stylist', cta: 'Try as stylist', icon: 'scissors', title: 'Stylists & staff', app: 'Employee app', login: 'stylist@glowcraft.in',
    pain: '"How much have I earned?" — known only on payday.',
    points: ['Live earnings wallet after every bill', 'Selfie + location attendance, shift swaps', 'Client notes, colour formula, allergies', 'Lessons, skill badges and a visible career ladder'],
  },
  {
    key: 'franchise', cta: 'Try as brand HQ', icon: 'building', title: 'Franchise HQ', app: 'Franchise console', login: 'hq@glowcraft.in',
    pain: 'No live network view; SOP drift; royalty disputes.',
    points: ['Every outlet’s KPIs side by side, ranked', 'Royalty auto-calculated on billed sales', 'Central menu & price push, national offers', 'Digital audits with action items to closure'],
  },
  {
    key: 'vendor', cta: 'Try as distributor', icon: 'truck', title: 'Brands & distributors', app: 'Vendor portal', login: 'distributor@saloonbaba.in',
    pain: 'Orders by phone, long credit cycles, no sell-through data, fakes.',
    points: ['Salon low-stock alerts become draft orders', 'Credit limits & UPI collections', 'Aggregated sell-through and usage insights', 'Promotions, courses, AMC tickets, authenticity QR'],
  },
  {
    key: 'customer', cta: 'Try as customer', icon: 'heart', title: 'Customers', app: 'Customer app', login: 'customer@saloonbaba.in',
    pain: 'Unknown wait, price surprises, inconsistent results.',
    points: ['“Seat in 15 min” — live wait at nearby salons', 'Full menu with GST-inclusive prices', 'Verified reviews per stylist', 'Book, join the queue, pay deposit by UPI, rebook “same as last time”'],
  },
];

const PROBLEMS = [
  ['First-timers don’t return', 'Rebook-before-leaving, 48-hour thank-you, due-date reminders, win-back', '2nd-visit return 45% → 60%+'],
  ['Empty chairs at dead hours', 'Off-peak happy hours pushed to nearby customers, live queue', 'Chair utilisation'],
  ['No-shows', 'UPI deposits for new clients & long services, reminders, no-show score', 'No-show rate'],
  ['Payroll eats profit', 'Rule-based salary + commission + slabs, live payroll % of revenue', 'Payroll at 30–35%'],
  ['Retail is under-sold', 'Stylists “prescribe” home-care; WhatsApp home-care card; refill reminders', 'Retail 12% → 20%+'],
  ['Back-bar leakage', 'Recipe per service, auto-deduct on billing, variance by stylist', 'Product cost %'],
  ['Cash leakage', 'Discount OTP approval, void trail, daily cash closing, anomaly flags', 'Unexplained variance'],
  ['Client data walks out', 'Salon-owned client cloud, masked numbers for staff', 'Clients kept after exits'],
  ['No true P&L', 'Expenses beside revenue, daily P&L, break-even, Tally export', 'Net margin, daily'],
  ['Franchise blind spots', 'Network dashboard, audits, royalty engine, lead routing', 'Outlet variance'],
];

const FEATURES = [
  ['calendar', 'Smart calendar & queue', 'Skill-based stylist assignment, double-booking blocked, walk-in tokens with ETA.'],
  ['receipt', 'GST billing on WhatsApp', 'GST-inclusive prices, split payments, tips, packages, wallet, UPI QR at the counter.'],
  ['users', 'Retention engine', 'Client card with formula & allergies, at-risk and lapsed lists, automated win-back.'],
  ['megaphone', 'Campaigns with attribution', 'WhatsApp/SMS to segments; see offer → visit → repeat and cost per visit.'],
  ['box', 'Inventory with recipes', 'Back-bar auto-deduct, low stock, expiry, usage variance, one-tap reorder.'],
  ['wallet', 'Payroll & incentives', 'Fixed + commission + target slabs + retail incentive; payslips on WhatsApp.'],
  ['chart', 'Daily P&L', 'Snap-a-bill expenses, cash closing, break-even tracker, GST report, Tally XML.'],
  ['shield', 'Loss prevention', 'Audit trail of voids, discounts, cancellations; billed vs attended hours.'],
  ['clipboard', 'Hygiene & SOP', 'Checklists with photo proof feed a hygiene badge customers can see.'],
  ['star', 'Private-first reviews', 'Unhappy clients reach the manager first; verified stylist-level reviews.'],
  ['book', 'Learn & grow', '5-minute lessons, skill badges, career ladder — staff stay longer.'],
  ['qr', 'Authentic products', 'Brands print QR codes; salons and clients verify packs in seconds.'],
];

const FAQ = [
  ['Does it work without the internet for a few minutes?', 'The app is a lightweight PWA that loads fast on a ₹8,000 Android phone and caches itself. Bills sync as soon as the connection is back.'],
  ['Do my customers need to download an app?', 'No. They can book from a link, your WhatsApp number, Google or Instagram. The app is optional.'],
  ['Who owns the client data?', 'The salon does. Stylists see masked phone numbers and message clients from the salon’s WhatsApp number.'],
  ['Can I import from my current billing software?', 'Yes — clients, services and products import from Excel/CSV during onboarding. We do it for you.'],
  ['Which languages?', 'English, हिन्दी, தமிழ், తెలుగు, ಕನ್ನಡ and বাংলা for the staff and customer apps.'],
];

export default function Landing() {
  const { user, login } = useAuth();
  const plans = useApi('/public/plans');
  const [run, busy] = useAction();
  const [form, setForm] = useState({ name: '', phone: '', business_name: '', city: '', outlets: 1, role: 'owner', message: '' });
  const [sent, setSent] = useState(false);

  const tryAs = (email) => run(async () => {
    const u = await login(email, 'demo123');
    navigate(HOME[u.role]);
  });
  const submit = (e) => {
    e.preventDefault();
    run(() => post('/public/demo-requests', form), 'Thanks! We will WhatsApp you within one working day.').then(() => setSent(true)).catch(() => {});
  };

  return (
    <div>
      <nav className="land-nav">
        <a href="/" className="row" style={{ color: 'var(--text)', fontWeight: 800, fontSize: 18 }}><img src="/icon.svg" width="30" height="30" alt="" />SaloonBaba</a>
        <div className="links">
          <a href="#apps">Apps</a><a href="#features">Features</a><a href="#pricing">Pricing</a><a href="#demo">Book a demo</a>
        </div>
        <div className="row" style={{ marginLeft: 'auto' }}>
          {user ? <Button size="sm" onClick={() => navigate(HOME[user.role])}>Open my app</Button> : <Button size="sm" variant="ghost" onClick={() => navigate('/login')}>Log in</Button>}
        </div>
      </nav>

      <header className="hero">
        <div>
          <Badge tone="primary">Salon OS · Booking app · Franchise console</Badge>
          <h1 className="mt">Fill every chair.<br /><em>Keep every client.</em><br />Know your real profit.</h1>
          <p className="lead">SaloonBaba runs the whole salon — bookings, walk-in queue, GST billing, staff pay, stock and daily P&amp;L — and gives your customers live wait times and verified stylist reviews. Built for Indian salons, chains and franchises.</p>
          <div className="row wrap mt-l">
            <Button size="lg" icon="play" onClick={() => document.getElementById('apps').scrollIntoView({ behavior: 'smooth' })}>Try the live demo</Button>
            <Button size="lg" variant="ghost" onClick={() => document.getElementById('demo').scrollIntoView({ behavior: 'smooth' })}>Book a free demo</Button>
          </div>
          <div className="row wrap mt-l small muted gap-l">
            <span className="row gap-s"><Icon name="whatsapp" size={16} />WhatsApp bills & reminders</span>
            <span className="row gap-s"><Icon name="qr" size={16} />UPI deposits</span>
            <span className="row gap-s"><Icon name="receipt" size={16} />GST + Tally</span>
            <span className="row gap-s"><Icon name="globe" size={16} />6 Indian languages</span>
          </div>
        </div>
        <HeroMock />
      </header>

      <section className="l-section">
        <div className="kpis">
          {[['55%', 'of first-time clients never come back to an average salon'], ['2×', 'clients who book online return twice as often as walk-ins (78% vs 39%)'], ['47%', 'fewer no-shows when new clients pay a small deposit'], ['30–35%', 'is where payroll should sit as a share of revenue — many run far above']].map(([n, t]) => (
            <div key={n} className="stat"><div className="value" style={{ color: 'var(--primary)', fontSize: 30 }}>{n}</div><div className="small muted">{t}</div></div>
          ))}
        </div>
        <p className="tiny muted mt">Industry benchmarks from salon research (Boulevard 2023, Phorest, NHBF 2025). SaloonBaba measures each of these numbers for your salon every day.</p>
      </section>

      <section className="l-section" id="apps">
        <div className="kicker">One platform, six apps</div>
        <h2>Everyone in the salon business gets their own app</h2>
        <p className="muted">Tap “Try” to open the live demo with realistic data — no signup needed.</p>
        <div className="grid-auto mt-l">
          {PERSONAS.map((p) => (
            <div key={p.key} className="card col">
              <div className="row">
                <div className="feature"><div className="ic"><Icon name={p.icon} /></div></div>
                <div><div className="bold">{p.title}</div><div className="tiny muted">{p.app}</div></div>
              </div>
              <div className="small" style={{ fontStyle: 'italic' }}>“{p.pain}”</div>
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{p.points.map((x) => <li key={x}>{x}</li>)}</ul>
              <Button variant="soft" icon="play" busy={busy} onClick={() => tryAs(p.login)} className="mt">{p.cta}</Button>
            </div>
          ))}
        </div>
      </section>

      <section className="l-section">
        <div className="kicker">Problem → module → number</div>
        <h2>Every module exists because a problem costs someone money</h2>
        <div className="card pad-0 mt-l">
          <table className="table responsive">
            <thead><tr><th>Problem</th><th>What SaloonBaba does</th><th>Number it moves</th></tr></thead>
            <tbody>
              {PROBLEMS.map(([a, b, c]) => (
                <tr key={a}><td className="primary-cell" data-label="Problem">{a}</td><td data-label="Module">{b}</td><td data-label="Moves"><Badge tone="good">{c}</Badge></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="l-section" id="features">
        <div className="kicker">Salon OS</div>
        <h2>Everything a salon runs on, in one light app</h2>
        <div className="grid-auto mt-l">
          {FEATURES.map(([ic, t, d]) => (
            <div key={t} className="feature"><div className="ic"><Icon name={ic} /></div><div><div className="bold">{t}</div><div className="small muted">{d}</div></div></div>
          ))}
        </div>
      </section>

      <section className="l-section">
        <div className="card" style={{ background: 'linear-gradient(135deg, var(--primary-soft), var(--surface))' }}>
          <div className="kicker">Why salons switch</div>
          <h2>Not another listings app</h2>
          <div className="grid-auto mt">
            {[
              ['Depth over breadth', 'Real-time chair and stylist availability, walk-in queue and stylist-level reviews — only possible because the salon runs on our OS.'],
              ['Salon-friendly economics', 'Repeat bookings are free. The client belongs to the salon, not to us.'],
              ['Tier-2 and vernacular first', 'Tamil, Hindi, Telugu, Kannada, Bengali. WhatsApp booking with no app download.'],
              ['In-salon, not at-home', 'We make the salon itself stronger instead of pulling stylists away.'],
            ].map(([t, d]) => <div key={t}><div className="bold">{t}</div><div className="small muted">{d}</div></div>)}
          </div>
        </div>
      </section>

      <section className="l-section" id="pricing">
        <div className="kicker">Pricing</div>
        <h2>Pay per outlet. Start free.</h2>
        <p className="muted">Prices exclude GST. Onboarding, data import and staff training included. Cancel any time.</p>
        <div className="grid-auto mt-l">
          {(plans.data || []).map((p) => (
            <div key={p.id} className={`price-card ${p.popular ? 'popular' : ''}`}>
              <div className="row between"><b style={{ fontSize: 18 }}>{p.name}</b>{p.popular && <Badge tone="primary">Most popular</Badge>}</div>
              <div><span style={{ fontSize: 30, fontWeight: 800 }}>{p.price === null ? 'Talk to us' : p.price === 0 ? 'Free' : inr(p.price)}</span> <span className="small muted">{p.price ? p.period : ''}</span></div>
              <div className="small muted">{p.tagline}</div>
              <ul>{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
              <Button variant={p.popular ? '' : 'ghost'} onClick={() => { setForm((f) => ({ ...f, message: `Interested in the ${p.name} plan` })); document.getElementById('demo').scrollIntoView({ behavior: 'smooth' }); }}>Choose {p.name}</Button>
            </div>
          ))}
        </div>
      </section>

      <section className="l-section" id="demo">
        <div className="grid grid-md-2" style={{ alignItems: 'start' }}>
          <div>
            <div className="kicker">Book a demo</div>
            <h2>See your own salon’s numbers in 20 minutes</h2>
            <p className="muted">We set up your menu, staff and last 3 months of bills, then show you your 2nd-visit return rate, dead hours and payroll % — free.</p>
            <div className="col mt-l small">
              {['Free migration from Excel or your billing software', 'WhatsApp Business number set-up', 'On-site staff training in your language', 'Go live in 3 days'].map((x) => <div key={x} className="row gap-s"><Icon name="checkCircle" size={18} className="good" />{x}</div>)}
            </div>
          </div>
          <form className="card col" onSubmit={submit}>
            {sent ? (
              <div className="center col" style={{ padding: 20 }}><Icon name="checkCircle" size={40} className="good" style={{ margin: '0 auto' }} /><h3>Request received</h3><p className="muted">We will WhatsApp you within one working day. Meanwhile, try the live demo above.</p></div>
            ) : (
              <>
                <div className="grid-2">
                  <Input label="Your name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  <Input label="WhatsApp number" required inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="grid-2">
                  <Input label="Salon / brand" value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} />
                  <Input label="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                </div>
                <div className="grid-2">
                  <Select label="I am a" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} options={[['owner', 'Salon owner'], ['franchisee', 'Franchisee'], ['franchisor', 'Franchise brand'], ['vendor', 'Brand / distributor'], ['other', 'Other']]} />
                  <Input label="Outlets" type="number" min="1" value={form.outlets} onChange={(e) => setForm({ ...form, outlets: e.target.value })} />
                </div>
                <Textarea label="What would you like to fix first?" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
                <Button type="submit" busy={busy} className="lg">Request my demo</Button>
              </>
            )}
          </form>
        </div>
      </section>

      <section className="l-section">
        <h2>Questions</h2>
        <div className="col mt">
          {FAQ.map(([q, a]) => (
            <details key={q} className="card flat"><summary className="bold" style={{ cursor: 'pointer' }}>{q}</summary><p className="muted mt">{a}</p></details>
          ))}
        </div>
      </section>

      <footer className="footer">
        <div className="row" style={{ justifyContent: 'center', fontWeight: 800, color: 'var(--text)' }}><img src="/icon.svg" width="22" height="22" alt="" />SaloonBaba</div>
        <p className="mt">The operating system for salons · Made in India</p>
        <p><a href="/login">Log in</a> · <a href="/app">Find a salon</a> · <a href="/verify">Verify a product</a> · <a href="#demo">Contact sales</a></p>
      </footer>
    </div>
  );
}

function HeroMock() {
  return (
    <div className="phone-mock" aria-hidden="true">
      <div style={{ padding: 14, background: 'var(--surface)' }}>
        <div className="row between"><b>Today · Anna Nagar</b><Badge tone="good">Open</Badge></div>
        <div className="kpis mt" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="stat"><div className="label">Revenue</div><div className="value">₹38.4k</div><div className="sub"><span className="delta up">▲ 12%</span></div></div>
          <div className="stat"><div className="label">2nd-visit return</div><div className="value">64%</div><div className="sub">best: 70%</div></div>
          <div className="stat"><div className="label">Chairs full</div><div className="value">71%</div></div>
          <div className="stat"><div className="label">Payroll</div><div className="value">33%</div></div>
        </div>
        <div className="notice warn mt small"><Icon name="zap" size={16} />Tue 2–5 pm is 28% full — run a happy hour?</div>
        <div className="card flat mt">
          <div className="row between small"><span className="row gap-s"><Icon name="queue" size={16} />Walk-in queue</span><b>Seat in 15 min</b></div>
          <div className="row gap-s mt">{['T4', 'T5', 'T6'].map((t) => <Badge key={t} tone="primary">{t}</Badge>)}</div>
        </div>
        <div className="card flat mt">
          <div className="small muted">Ravi’s earnings today</div>
          <div className="row between"><b style={{ fontSize: 20 }}>₹1,860</b><span className="small muted">₹6,200 to next bonus</span></div>
          <div className="progress mt"><i style={{ width: '72%' }} /></div>
        </div>
      </div>
    </div>
  );
}
