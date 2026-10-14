# SaloonBaba — the operating system for salons

SaloonBaba is a complete, mobile-first platform for the salon business: one **Salon OS** that runs the floor (bookings, walk-in queue, GST billing, staff pay, stock, daily P&L) plus dedicated apps for **every person in the ecosystem** — owners, managers, stylists, franchise HQ, vendors and customers.

It is built from the *Salon Industry Problems & Product Blueprint*: every module exists because a problem costs someone money, and every screen shows the number it moves (2nd-visit return, chair utilisation, no-shows, payroll %, retail %, product cost %, cash variance, outlet variance).

> **Stack:** React 18 + Vite (no UI library, custom 70-line router, hand-written SVG charts) · Node.js + Express 5 · MySQL 8
> **Integrations:** WhatsApp Cloud API · MSG91 SMS · Razorpay (UPI / cards) · OpenStreetMap · Tally XML export — all runnable in a *simulated* mode with no keys.

---

## Contents

1. [Quick start (local)](#1-quick-start-local)
2. [Demo logins](#2-demo-logins)
3. [The six apps](#3-the-six-apps)
4. [Guided 10-minute demo](#4-guided-10-minute-demo)
5. [Blueprint → module map](#5-blueprint--module-map)
6. [Integrations](#6-integrations)
7. [Architecture & performance](#7-architecture--performance)
8. [Project structure](#8-project-structure)
9. [API overview](#9-api-overview)
10. [Scripts & testing](#10-scripts--testing)
11. [Production deployment](#11-production-deployment)
12. [Marketing & go-to-market](#12-marketing--go-to-market)
13. [Roadmap](#13-roadmap)

---

## 1. Quick start (local)

### Prerequisites

| Tool | Version |
|---|---|
| Node.js | 18.18 or newer (20/22 recommended) |
| MySQL | 8.0 (MariaDB 10.6+ also works) |
| npm | 9+ |

### Steps

```bash
# 1. Clone
git clone https://github.com/Rakeshkumar-369/SaloonBaba.git
cd SaloonBaba

# 2. Create a MySQL user (once). Use your MySQL root login:
mysql -u root -p -e "CREATE USER IF NOT EXISTS 'saloonbaba'@'localhost' IDENTIFIED BY 'saloonbaba';
GRANT ALL PRIVILEGES ON saloonbaba.* TO 'saloonbaba'@'localhost'; FLUSH PRIVILEGES;"

# 3. Configure
cp .env.example .env          # edit DB_* if your MySQL user/password differ

# 4. Install, create the database and load demo data (~10 seconds)
npm install
npm run db:reset

# 5. Run API + web app with live reload
npm run dev
```

Open **http://localhost:5173** — the marketing site. Click **Log in** (or *Try the live demo*) and tap any demo account.

The API runs on http://localhost:4000 (Vite proxies `/api` to it during development).

> **Windows:** the same commands work in PowerShell. If `mysql` is not on your PATH, run the `CREATE USER` statement from MySQL Workbench.

### One-command alternative: Docker

```bash
docker compose up --build
```

Then open **http://localhost:4000**. The first start creates the schema and loads demo data automatically. To start again with fresh demo data: `docker compose down -v && docker compose up --build`.

### Refreshing demo data

Demo data is generated **relative to today** (120 days of history + 14 days of future bookings), so dashboards always look current. Re-run `npm run db:reset` any time — for example the next morning — to get a fresh "today".

---

## 2. Demo logins

**Password for every account: `demo123`** (you can also log in with the phone number instead of the email). The login page has one-tap buttons for all of these.

### Main demo accounts

| App | Role | Name | Login | What to look at |
|---|---|---|---|---|
| Customer app | Customer | Priya Sharma | `customer@saloonbaba.in` | Chennai. Regular at GlowCraft Anna Nagar with Ravi, Gold member, membership + wallet, colour formula, prescribed products, a paid shop order |
| Customer app | Customer | Rahul Verma | `customer2@saloonbaba.in` | Bengaluru, men's grooming at The Mane Room |
| Salon OS | Owner (independent) | Meera Iyer | `owner@maneroom.in` | The Mane Room, Indiranagar — premium single outlet |
| Salon OS | Owner (franchisee, 2 outlets) | Anand Krishnan | `franchisee@glowcraft.in` | GlowCraft Anna Nagar + Velachery — multi-outlet rollup, P&L after royalty, pending OTP approval |
| Salon OS | Manager | Lakshmi Narayanan | `manager@glowcraft.in` | GlowCraft Anna Nagar — front desk, billing, cash closing (fewer permissions than owner) |
| Employee app | Senior stylist | Ravi Kumar | `stylist@glowcraft.in` | Live earnings wallet, today's clients with formulas, badges |
| Employee app | Junior stylist | Divya S | `junior@glowcraft.in` | Career ladder, courses, leave & shift-swap requests |
| Franchise console | Brand HQ | Kavitha Raman | `hq@glowcraft.in` | GlowCraft network: ranking, royalty, central menu, leads, training |
| Franchise console | Area manager | Suresh Babu | `area@glowcraft.in` | Digital audits and action items |
| Vendor portal | Distributor | ProBeauty Distributors | `distributor@saloonbaba.in` | Incoming orders, credit & collections, sell-through |
| Vendor portal | Product brand | Veda Pro Haircare | `brand@saloonbaba.in` | Promotions, authenticity codes, insights |
| Vendor portal | Academy | Shear Skills Academy | `academy@saloonbaba.in` | Course marketplace with skill badges |
| Vendor portal | Equipment supplier | StyleChair Equipments | `equipment@saloonbaba.in` | Service tickets, warranty & AMC |
| Platform | SaloonBaba admin | Arjun Mehta | `admin@saloonbaba.in` | All salons, plans/MRR, demo leads from the website, message log, automations, WhatsApp bot simulator |

### Every other owner, manager and stylist (also password `demo123`)

| Salon | City | Type | Owner | Manager | Stylists |
|---|---|---|---|---|---|
| GlowCraft Anna Nagar | Chennai | Franchise (best outlet) | `franchisee@glowcraft.in` | `manager@glowcraft.in` | `stylist@glowcraft.in` (Ravi), `junior@glowcraft.in` (Divya), `arjunp.gcan@staff.saloonbaba.in`, `fatima.gcan@…`, `karthik.gcan@…`, `nisha.gcan@…` |
| GlowCraft Velachery | Chennai | Franchise | `franchisee@glowcraft.in` | `deepa@glowcraft.in` | `senthil.gcvel@…`, `priyanka.gcvel@…`, `joseph.gcvel@…`, `asha.gcvel@…` |
| GlowCraft T Nagar | Chennai | Franchise (struggling outlet: discounts, cash variance, low hygiene) | `farhan@glowcraft.in` | `vignesh@glowcraft.in` | `ramesh.gctn@…`, `sowmya.gctn@…`, `manoj.gctn@…`, `anitha.gctn@…` |
| GlowCraft Koramangala | Bengaluru | Franchise | `sneha@glowcraft.in` | `kiran@glowcraft.in` | `naveen.gckor@…`, `pooja.gckor@…`, `rohit.gckor@…`, `shalini.gckor@…` |
| The Mane Room | Bengaluru | Independent, premium | `owner@maneroom.in` | `manager@maneroom.in` | `aditya.mane@…`, `zoya.mane@…`, `vikram.mane@…`, `ananya.mane@…`, `rakesh.mane@…` |
| Barber Bros | Chennai | Independent, men only | `imran@barberbros.in` | — | `salman.barber@…`, `dinesh.barber@…`, `prakash.barber@…`, `akbar.barber@…` |
| Lotus Ladies Salon | Chennai | Independent, women only, home service | `revathi@lotussalon.in` | `kavya@lotussalon.in` | `meenakshi.lotus@…`, `gayathri.lotus@…`, `banu.lotus@…`, `selvi.lotus@…` |

`…` = `@staff.saloonbaba.in`. Customers can also sign up themselves or log in with **phone OTP** (in demo mode the OTP is shown on screen).

### What the demo data contains

7 salons in Chennai and Bengaluru · 1 franchise brand · 4 vendors · ~12,000 client cards · ~16,000 appointments · ~14,000 GST bills · 120 days of roster, attendance and stock movements · packages, memberships and wallets · payslips for the last 3 months · royalty invoices · audits with action items · campaigns with attribution · verified reviews (including unhappy private feedback waiting for recovery) · leads, courses, badges, equipment tickets, authenticity codes.

The simulation gives each salon a different personality so the insights mean something: Anna Nagar retains clients well, T Nagar leaks discounts and cash, Barber Bros runs at high utilisation, and Tuesday–Thursday afternoons are quiet everywhere (so the "run a happy hour" nudge appears).

---

## 3. The six apps

| App | URL | For | Highlights |
|---|---|---|---|
| **Marketing site** | `/` | Prospects | Problem → module → number, persona demos ("Try as owner"), pricing, demo-request form (lands in Admin → Demo leads) |
| **Customer app** | `/app` | Clients | Near-me discovery with **live "Seat in X min"**, filters (open now, women staff, hygiene badge, offers, home service), search by need ("curly hair", "bridal"), map view, GST-inclusive menu, stylist portfolios and verified reviews, book a slot or **join the walk-in queue remotely**, group/bridal bookings, **UPI deposit**, reschedule/cancel, "same as last time", wallet, packages, **SaloonBaba Gold**, referrals, beauty profile with due-date reminders, shop for stylist-prescribed products, private-first feedback |
| **Salon OS** | `/salon` | Owners & managers | KPI home with plain-language nudges, calendar (grid + list) for every channel, walk-in token queue with ETA, POS with split payments, wallet/package redemption, UPI QR, **owner OTP for big discounts**, **rebook-before-leaving prompt**, CRM with segments, campaigns with **offer → visit → repeat attribution**, inventory with **recipes, auto back-bar deduction, variance by stylist, one-tap reorder**, roster, selfie attendance, leave & swaps, **payroll + incentive engine**, expenses (snap-a-bill), cash closing, **daily P&L & break-even**, GST & Tally export, **loss prevention**, hygiene checklists with photo proof, review recovery, packages & prepaid liability, settings |
| **Employee app** | `/staff` | Stylists | 6 languages (English, हिन्दी, தமிழ், తెలుగు, ಕನ್ನಡ, বাংলা), my day with client notes/formula/allergies, **selfie + GPS check-in**, **live earnings wallet** (commission, retail incentive, slab bonus, tips, advances), roster & swap/leave requests, masked client book with messaging from the salon's number, prescribe home-care, portfolio, lessons with quizzes, skill badges, **career ladder**, weekly leaderboard, anonymous voice |
| **Franchise console** | `/franchise` | Brand HQ, area managers | Network dashboard with outlet ranking and drill-down to stylists, **royalty engine**, central menu & price push with lock/override, national offers, **digital audits → action items to closure**, central procurement with negotiated prices, **lead routing to nearest outlet** with response-time tracking, training assignment, SOP & hygiene compliance |
| **Vendor portal** | `/vendor` | Distributors, brands, academies, equipment | Storefront (trade price, MOQ, schemes), incoming orders (accept / dispatch, credit-limit check), **credit & collections with suggested limits from real salon sales**, sell-through & back-bar usage by city, targeted promotions, education marketplace, warranty/AMC/service tickets, **authenticity QR codes** with suspicious-scan detection |
| **Admin** | `/admin` | SaloonBaba team | Salons, plans & MRR, GMV, demo leads, users, message log, run automations, WhatsApp bot simulator |
| Public pages | `/bill/:token`, `/verify`, `/s/:slug` | Anyone | GST bill shared on WhatsApp (with private-first feedback form), product authenticity check, shareable salon booking link |

---

## 4. Guided 10-minute demo

1. **Website** → `http://localhost:5173` → scroll to *One platform, six apps* → **Try as customer**.
2. **Customer (Priya)** → Discover shows live waits → open *GlowCraft Anna Nagar* → *Same as last time* → pick tomorrow → confirm. Open *Lotus Ladies Salon*, add *Keratin Treatment*, book → a **UPI deposit** checkout appears (demo payment). *Bookings* shows it; *Profile* shows formula, allergies and "root touch-up due".
3. **Manager (Lakshmi)** → *Calendar & queue* → walk-in queue → add a token → *Call* a stylist → *Bill*. Add a ₹400 manual discount → **Request owner OTP** (shown on screen in demo mode) → verify → *Collect* → the **rebook prompt** books the next visit. Try *Finance → Cash closing*.
4. **Owner (Anand)** → *Home*: KPIs vs benchmarks and nudges ("Wed 1–4 pm is 14% full — run a happy hour?"). Switch outlets or open *All outlets*. Visit *Finance → P&L* (after royalty), *Loss prevention*, *Staff → Payroll*, *Approvals*.
5. **Stylist (Ravi)** → check in with selfie, see earnings update, open a lesson, switch the language to தமிழ் from the account menu.
6. **Brand HQ (Kavitha)** → outlet ranking (T Nagar is flagged), *Royalty → Generate*, *Leads*, *Menu & offers → Push to all outlets*. **Area manager (Suresh)** → *Audits → New audit*.
7. **Distributor** → accept the new order from GlowCraft Anna Nagar; *Credit* shows suggested limits from salon sales. **Brand** → *Authenticity* (try `/verify/SB-VEDA2026` in another tab).
8. **Admin** → *Demo leads* shows the request you submitted on the website; *Overview → Run now* runs the automations; *Messages* shows every WhatsApp/SMS the system would send.

---

## 5. Blueprint → module map

| Problem (blueprint) | Module | Where in the app | Number it moves |
|---|---|---|---|
| First-timers don't return | Rebook-before-leaving prompt, 48-hour thank-you, due-date reminders, win-back automations | Billing → rebook sheet · Admin → automations · Clients → *Due*, *At risk* | 2nd-visit return % |
| Empty chairs at dead hours | Happy-hour offers shown "live now" on customer app, utilisation heat-map, live queue | Marketing → Offers · Insights · Customer app | Chair utilisation % |
| No-shows | UPI deposit for new clients / long services / repeat no-shows, reminders, no-show score on the client | Customer booking · Calendar badges · Settings → policies | No-show % |
| Payroll eats profit | Salary + commission + target slabs + retail incentive; live payroll % | Staff → Payroll · Employee app → Earnings | Payroll % of sales |
| Retail under-sold | Prescribe → WhatsApp home-care card → in-app shop; refill reminders; retail incentive | Employee app · Customer → Shop · Inventory → Customer orders | Retail % |
| Back-bar leakage | Recipes per service, auto-deduct on bill, issue log, variance by stylist, stock counts | Inventory → Recipes / Usage variance | Product cost % |
| Cash leakage, unbilled work | OTP discount approval, void approval, audit trail, cash closing with variance alerts, billed vs attended hours | Approvals · Loss prevention · Finance → Cash | Unexplained variance |
| Client data walks out | Salon-owned client cloud, masked phones for staff, messages from salon number | Clients · Employee app → Clients | Clients retained after exits |
| No true P&L | Expenses + recurring costs beside revenue, daily P&L, profit by service, break-even, GST/Tally | Finance | Net margin |
| Packages untracked | Packages, memberships, wallet, liability ledger | Packages · Finance → Prepaid liability · Customer → Wallet | Package liability |
| Marketing guesswork | Segmented WhatsApp/SMS campaigns with attribution, referrals, festival planner | Marketing | Cost per retained client |
| Booking chaos | One calendar for walk-in, phone, WhatsApp bot, Instagram, Google, app; skill-based auto-assign; double booking blocked | Calendar · Settings → Booking channels | Missed / double bookings |
| Roster & attendance | Shift planner, selfie + geo check-in, leave & swap approvals | Staff · Employee app | Hours scheduled vs booked |
| Incentive disputes | Live earnings wallet | Employee app → Earnings | Disputes |
| Stock-outs | Low-stock alerts, one-tap reorder, distributor storefront | Inventory · Vendor portal | Stock-out days |
| Bad public reviews | Private-first feedback, recovery with WhatsApp + wallet credit | Reviews · Public bill page | Rating, recovered complaints |
| Franchise visibility & SOP drift | Network ranking, audits & actions, royalty engine, central menu, SOP checklists | Franchise console | Outlet variance |
| Training & career path | Lessons, quizzes, badges, career ladder, course marketplace | Employee app → Learn · Franchise → Training · Vendor → Courses | Staff tenure |
| Unknown wait, price, quality | Live wait, GST-inclusive prices, stylist-level verified reviews, hygiene badge | Customer app | Bookings per salon |
| Supply-chain friction & fakes | B2B catalogue, credit, sell-through data, authenticity codes | Vendor portal · `/verify` | Order frequency, overdue days |

---

## 6. Integrations

Everything works without API keys ("**simulated**" mode): messages are recorded in the message log and payments use a demo checkout sheet. Add keys to `.env` to go live — no code changes.

| Integration | `.env` keys | What it does |
|---|---|---|
| **WhatsApp Cloud API** (Meta) | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` | GST bills, booking confirmations, reminders, thank-you/feedback links, win-back, payslips, owner OTP, queue "your stylist is ready", home-care cards. **Booking bot** webhook: `GET/POST /api/integrations/whatsapp/webhook` (commands `MENU`, `QUEUE`, `JOIN`, `BOOK`, `STOP`). Business-initiated messages outside the 24-hour window need approved templates in Meta. |
| **MSG91 SMS** | `MSG91_AUTH_KEY`, `MSG91_SENDER_ID`, `MSG91_TEMPLATE_ID` | Login OTP and SMS campaigns (DLT-approved template required in India). |
| **Razorpay** | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | UPI/card deposits, customer shop orders, SaloonBaba Gold, distributor and royalty payments. Checkout signature verified server-side; webhook `POST /api/integrations/razorpay/webhook` (`payment.captured`, `order.paid`). |
| **UPI QR** | salon UPI ID in *Settings* | Dynamic UPI QR for the exact bill amount at the counter. |
| **Tally** | — | *Finance → GST & Tally* exports sales vouchers (Tally XML) and a GSTR-1-style CSV. |
| **Maps** | — | OpenStreetMap tiles (Leaflet, loaded only on the map view) and an embed on salon pages. |

**Automations** (`SCHEDULER_ENABLED=true`, every `SCHEDULER_INTERVAL_MIN` minutes, idempotent): appointment reminders (24 h), 48-hour thank-you with feedback link, service-due reminders, win-back for lapsed clients, low-stock alerts, product refill reminders, overdue distributor invoices, hygiene score refresh. Admin → *Run now* triggers them on demand.

---

## 7. Architecture & performance

```
Browser (React PWA)  ──/api──▶  Express 5 API  ──▶  MySQL 8
   │  lazy chunk per app/module      │  services: availability, billing, kpi,
   │  service-worker cache           │  payroll, finance, segments, automations
   └─ Razorpay checkout (live mode)  └─ integrations: WhatsApp, MSG91, Razorpay
```

**Why it loads fast**

- No UI framework or chart library — a small design system in one CSS file and SVG charts written by hand.
- A 70-line router instead of a routing library.
- Every app *and every Salon OS module* is a separate lazy chunk. A customer downloads ~60 KB gzipped (React 45 KB + app core 12 KB + CSS 5 KB) plus ~11 KB for the customer app; a stylist never downloads the franchise console. Salon OS modules are 1–7 KB each. Leaflet (44 KB) only loads when someone opens the map.
- Stale-while-revalidate data cache: screens you have visited render instantly while fresh data loads.
- Hashed assets cached for a year, gzip compression, PWA manifest + service worker (installable on Android).
- System fonts (no web-font download).

**Security**

- Passwords hashed with bcrypt; JWT sessions (30 days); rate limiting on login/OTP.
- Every salon route checks the user's relationship to that salon (owner, manager, stylist, brand HQ read-only, admin) and owner-only actions are enforced on the server.
- Stylists only see masked client phone numbers; client messages go from the salon's number.
- Discounts above the salon's limit and bill voids require owner approval (OTP) and are written to an audit trail.
- Parameterised SQL everywhere, Helmet security headers with a strict CSP, upload type/size limits, Razorpay signature verification.

**Money & tax rules**

- Menu prices are **GST-inclusive** (18% → 9% CGST + 9% SGST, SAC 999721), so customers never see a different number at the counter.
- Package sales are recognised as revenue when sold; package sessions are ₹0 lines when redeemed (no double counting). Wallet top-ups are prepaid liabilities, recognised when spent.
- All times are stored and shown in salon local time (Asia/Kolkata).

---

## 8. Project structure

```
SaloonBaba/
├─ server/                      Node.js + Express API
│  ├─ db/
│  │  ├─ schema.sql             67 tables
│  │  ├─ seed.js                deterministic 4-month simulation (demo data)
│  │  ├─ seedData.js            salons, staff, menus, vendors, courses
│  │  ├─ demoAccounts.js        demo logins shown on the login page
│  │  └─ reset.js               drop → create → schema → seed
│  └─ src/
│     ├─ index.js / app.js      server bootstrap, security, static hosting
│     ├─ config.js / db.js      env + MySQL pool helpers
│     ├─ middleware/auth.js     JWT, roles, salon access levels
│     ├─ integrations/          whatsapp.js, sms.js (MSG91), razorpay.js
│     ├─ services/              availability (slots, queue ETA), billing (GST, POS),
│     │                         kpi, payroll, finance (P&L, Tally), segments,
│     │                         reviews, payments, notify, automations
│     └─ routes/                auth, public, me, customer, staffApp, franchise,
│                               vendor, admin, integrations, salon/* (10 modules)
├─ client/                      React + Vite PWA
│  └─ src/
│     ├─ lib/                   api (cache), router, auth, i18n (6 languages), format, pay
│     ├─ ui/                    kit (components), charts, Shell, Form, DemoPay, Icon
│     └─ apps/                  public, customer, salon (17 modules), staff, franchise, vendor, admin
├─ scripts/                     dev runner, API smoke test, docker entrypoint
├─ docs/                        go-to-market plan
├─ Dockerfile, docker-compose.yml
└─ .env.example
```

---

## 9. API overview

All endpoints are under `/api`. Authenticated calls use `Authorization: Bearer <token>` from `POST /api/auth/login`.

| Group | Base path | Examples |
|---|---|---|
| Auth | `/auth` | `POST /login`, `POST /register`, `POST /otp/request`, `POST /otp/verify`, `GET /demo-accounts` |
| Me | `/me` | `GET /` (user + context), `PATCH /` (language), notifications, `POST /payments/:id/confirm` |
| Public | `/public` | plans, stats, `POST /demo-requests`, `GET /bill/:token`, `POST /bill/:token/feedback`, `GET /verify/:code`, `GET /upi-qr` |
| Customer | `/customer` | `GET /salons` (filters, live wait), `GET /salons/:slug`, slots, `POST /bookings`, queue, profile, wallet, Gold, offers, reviews, shop |
| Salon OS | `/salons/:salonId` | dashboard, appointments, slots, queue, `billing/preview`, `billing/checkout`, `billing/rebook`, approvals, invoices, clients, campaigns, offers, products, recipes, variance, purchase-orders, staff, roster, attendance, leaves, payroll, expenses, cash-closing, pnl, break-even, gst, tally, royalty, insights, loss, checklists, reviews, packages, messages, settings |
| Employee | `/staff-app` | home, attendance check-in/out (multipart selfie), roster, leave, earnings, clients, prescriptions, portfolio, learn, recognition, voice |
| Franchise | `/franchise` | overview, outlets/:id, royalty (generate/remind/mark-paid), catalogue (+push), offers, sop, audits, actions, procurement, leads (+routing), training, courses |
| Vendor | `/vendor` | overview, products, orders, credit, payments, insights, promotions, courses, service, codes |
| Admin | `/admin` | overview, salons, users, demo-requests, messages, `POST /automations/run` |
| Integrations | `/integrations` | WhatsApp webhook + simulator, Razorpay webhook |

---

## 10. Scripts & testing

| Command | What it does |
|---|---|
| `npm run dev` | API (auto-reload) on :4000 + Vite on :5173 |
| `npm run db:reset` | Recreate the database and load fresh demo data |
| `npm run build` | Production build of the web app into `client/dist` |
| `npm start` | Production server on :4000 (serves API + built web app) |
| `npm run smoke` | Logs in as every role and exercises ~300 API calls — reads plus write flows (booking → deposit → billing with OTP discount → rebook, queue, payroll, royalty, audits, vendor orders, public feedback). Start the API first. Note: write flows add demo records; run `npm run db:reset` afterwards for pristine data. Use `npm run smoke -- --read-only` to skip them. |

---

## 11. Production deployment

1. Provision MySQL 8 and set strong values for `DB_*` and `JWT_SECRET` in `.env`; set `NODE_ENV=production` and `APP_URL` to your domain (used in WhatsApp links).
2. `npm ci && npm run build`
3. Create the schema once without demo data: `node server/db/reset.js --no-seed` (warning: `reset.js` drops the database).
4. `npm start` behind Nginx/Caddy with HTTPS (or use the Dockerfile). Persist `server/uploads/` (selfies, bill photos, portfolio images) or move it to object storage.
5. Add WhatsApp, MSG91 and Razorpay keys; point the WhatsApp and Razorpay webhooks to `https://<your-domain>/api/integrations/...`.

---

## 12. Marketing & go-to-market

The product markets itself through the landing page (`/`) with live demo logins, a pricing section and a demo-request form that feeds *Admin → Demo leads*. The full go-to-market plan — positioning, ideal customers, pricing, channels, 90-day launch plan, sales demo script, objection handling and metrics — is in **[docs/MARKETING_PLAN.md](docs/MARKETING_PLAN.md)**.

---

## 13. Roadmap

From the blueprint's "later" list and natural next steps:

- At-home services booking, virtual try-on, bridal planner, subscriptions ("unlimited beard trims ₹999/month").
- Working-capital and equipment loans with an NBFC partner using salon cash-flow data.
- Native Android wrapper (the PWA already installs) and offline billing queue.
- More languages (Marathi, Malayalam, Gujarati) and voice input for stylists.
- Instagram DM and Google Reserve channel connectors.
