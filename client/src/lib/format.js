export const inr = (n, opts = {}) => {
  const v = Number(n || 0);
  if (opts.compact && Math.abs(v) >= 100000) return `₹${(v / 100000).toFixed(v >= 1000000 ? 1 : 2)}L`;
  if (opts.compact && Math.abs(v) >= 1000) return `₹${(v / 1000).toFixed(1)}k`;
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: opts.decimals ?? 0 })}`;
};
export const num = (n) => Number(n || 0).toLocaleString('en-IN');
export const pct = (n) => `${Number(n || 0).toFixed(Number(n) % 1 === 0 ? 0 : 1)}%`;

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const addDays = (s, n) => {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return ymd(new Date(y, m - 1, d + n));
};
export const ym = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const parse = (s) => {
  if (!s) return null;
  const [d, t = '00:00:00'] = String(s).split(/[ T]/);
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm] = t.split(':').map(Number);
  return new Date(y, m - 1, day, hh || 0, mm || 0);
};
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DOW = DAY;
export const time12 = (s) => {
  if (!s) return '';
  const t = String(s).includes(' ') ? String(s).split(' ')[1] : String(s);
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
};
export const dateShort = (s) => {
  const d = parse(s);
  return d ? `${d.getDate()} ${MON[d.getMonth()]}` : '';
};
export const dateDay = (s) => {
  const d = parse(s);
  return d ? `${DAY[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}` : '';
};
export const dateTime = (s) => (s ? `${dateShort(s)}, ${time12(s)}` : '');
export const monthLabel = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return `${MON[mo - 1]} ${y}`;
};
export const relDay = (s) => {
  const d = String(s).slice(0, 10);
  if (d === today()) return 'Today';
  if (d === addDays(today(), 1)) return 'Tomorrow';
  if (d === addDays(today(), -1)) return 'Yesterday';
  return dateDay(s);
};
export const ago = (s) => {
  const d = parse(s);
  if (!d) return '';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  const days = Math.round(mins / 1440);
  return days < 30 ? `${days} d ago` : dateShort(s);
};
export const daysSince = (s) => (s ? Math.round((Date.now() - parse(s).getTime()) / 86400000) : null);
export const initials = (name = '') => name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
export const cap = (s = '') => String(s).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
export const priceLevel = (n) => '₹'.repeat(Number(n || 1));
export const hueBg = (h, l = 52) => `hsl(${h} 62% ${l}%)`;
export const gradient = (h) => `linear-gradient(135deg, hsl(${h} 70% 55%), hsl(${(Number(h) + 40) % 360} 75% 45%))`;
export const delta = (a, b) => (b ? Math.round(((a - b) / Math.abs(b)) * 1000) / 10 : null);
