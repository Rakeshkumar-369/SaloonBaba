import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { hueBg, initials, delta as deltaOf, cap } from '../lib/format.js';

// ---------------------------------------------------------------- toast
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((msg, type = 'info') => {
    const id = Math.random();
    setItems((x) => [...x, { id, msg, type }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), type === 'error' ? 4500 : 2800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status">
        {items.map((t) => <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Run an async action with toast feedback. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (fn, success) => {
    setBusy(true);
    try {
      const out = await fn();
      if (success) toast(typeof success === 'function' ? success(out) : success, 'good');
      return out;
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error');
      throw e;
    } finally {
      setBusy(false);
    }
  };
  return [run, busy];
}

// ---------------------------------------------------------------- basics
export const Card = ({ children, className = '', title, action, ...rest }) => (
  <div className={`card ${className}`} {...rest}>
    {(title || action) && (
      <div className="card-head">
        {title && <h3>{title}</h3>}
        {action}
      </div>
    )}
    {children}
  </div>
);

export function Stat({ label, value, sub, now, prev, icon, invert = false, tone }) {
  const d = now !== undefined && prev !== undefined ? deltaOf(now, prev) : null;
  const good = d === null ? null : invert ? d < 0 : d > 0;
  return (
    <div className="stat">
      <div className="label">{icon && <Icon name={icon} size={14} />}{label}</div>
      <div className={`value ${tone || ''}`}>{value}</div>
      {(sub || d !== null) && (
        <div className="sub">
          {d !== null && d !== 0 && <span className={`delta ${good ? 'up' : 'down'}`}>{d > 0 ? '▲' : '▼'} {Math.abs(d)}% </span>}
          {sub}
        </div>
      )}
    </div>
  );
}

export const Button = ({ children, variant = '', size = '', icon, busy, className = '', ...rest }) => (
  <button className={`btn ${variant} ${size} ${className}`} disabled={busy || rest.disabled} {...rest}>
    {busy ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : icon && <Icon name={icon} size={16} />}
    {children}
  </button>
);

export const Badge = ({ children, tone = '' }) => <span className={`badge ${tone}`}>{children}</span>;

const STATUS_TONE = {
  completed: 'good', paid: 'good', present: 'good', approved: 'good', delivered: 'good', active: 'good', booked: 'info', confirmed: 'primary', closed: 'good', public: 'good', won: 'good', sent: 'good',
  checked_in: 'warn', in_service: 'warn', pending: 'warn', late: 'warn', placed: 'warn', accepted: 'info', dispatched: 'info', due: 'warn', open: 'warn', in_progress: 'info', private: 'bad', new: 'info', assigned: 'info', contacted: 'primary', scheduled: 'info', ready: 'info', draft: '', simulated: 'info',
  cancelled: 'bad', no_show: 'bad', absent: 'bad', rejected: 'bad', void: 'bad', failed: 'bad', lost: 'bad', exhausted: '', expired: 'bad', overdue: 'bad', recovered: 'good', leave: 'info', off: '',
};
export const StatusBadge = ({ status }) => <Badge tone={STATUS_TONE[status] || ''}>{cap(status)}</Badge>;

export const Avatar = ({ name, hue = 260, size = '', src }) =>
  src ? <img className={`avatar ${size}`} src={src} alt={name} style={{ objectFit: 'cover' }} /> : (
    <div className={`avatar ${size}`} style={{ background: hueBg(hue) }} aria-hidden="true">{initials(name)}</div>
  );

export const Stars = ({ value = 0, count }) => (
  <span className="row gap-s" style={{ display: 'inline-flex' }}>
    <span className="stars">★</span>
    <b className="num">{Number(value || 0).toFixed(1)}</b>
    {count !== undefined && <span className="muted small">({count})</span>}
  </span>
);

export const Progress = ({ value, max = 100, color }) => (
  <div className="progress"><i style={{ width: `${Math.max(0, Math.min(100, (value / (max || 1)) * 100))}%`, ...(color ? { background: color } : {}) }} /></div>
);

export const Empty = ({ icon = 'sparkles', title = 'Nothing here yet', children }) => (
  <div className="empty">
    <Icon name={icon} size={34} />
    <div className="bold">{title}</div>
    {children && <div className="small mt">{children}</div>}
  </div>
);

export const Loading = ({ rows = 3 }) => (
  <div className="col">
    {Array.from({ length: rows }).map((_, i) => <div key={i} className="skeleton" style={{ height: 64 }} />)}
  </div>
);

export const ErrorBox = ({ error, retry }) => (
  <div className="notice bad"><Icon name="alert" /><div className="grow">{error?.message || 'Could not load'}</div>{retry && <Button size="sm" variant="ghost" onClick={retry}>Retry</Button>}</div>
);

/** Wraps a useApi result: loading skeleton, error box, or children(data). */
export function Async({ q, children, rows }) {
  if (q.error && !q.data) return <ErrorBox error={q.error} retry={q.reload} />;
  if (q.data === undefined) return <Loading rows={rows} />;
  return children(q.data);
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'active' : ''} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}

export function Chips({ items, value, onChange, multi = false }) {
  const isOn = (k) => (multi ? value.includes(k) : value === k);
  return (
    <div className="chips">
      {items.map(([k, label, count]) => (
        <button key={k} className={`chip ${isOn(k) ? 'active' : ''}`} onClick={() => onChange(multi ? (isOn(k) ? value.filter((x) => x !== k) : [...value, k]) : k)}>
          {label}{count !== undefined && <span className="count">{count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ options, value, onChange }) {
  return (
    <div className="pill-toggle">
      {options.map(([k, label]) => <button key={k} className={value === k ? 'active' : ''} onClick={() => onChange(k)}>{label}</button>)}
    </div>
  );
}

// ---------------------------------------------------------------- form fields
export const Field = ({ label, children, hint }) => (
  <label className="field"><span>{label}</span>{children}{hint && <small className="tiny">{hint}</small>}</label>
);
export const Input = ({ label, hint, ...rest }) => (label ? <Field label={label} hint={hint}><input className="input" {...rest} /></Field> : <input className="input" {...rest} />);
export const Textarea = ({ label, ...rest }) => (label ? <Field label={label}><textarea className="input" {...rest} /></Field> : <textarea className="input" {...rest} />);
export function Select({ label, options, placeholder, ...rest }) {
  const el = (
    <select className="input" {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{cap(o)}</option>))}
    </select>
  );
  return label ? <Field label={label}>{el}</Field> : el;
}
export const Check = ({ label, ...rest }) => <label className="check"><input type="checkbox" {...rest} />{label}</label>;
export function SearchBox({ value, onChange, placeholder = 'Search' }) {
  return (
    <div className="search">
      <Icon name="search" size={18} />
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type="search" />
    </div>
  );
}

// ---------------------------------------------------------------- sheet (bottom sheet on phones, dialog on desktop)
export function Sheet({ open, onClose, title, children, wide = false, footer }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`sheet ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="grab" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        {children}
        {footer && <div className="mt-l">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- responsive table (becomes cards on phones)
export function Table({ columns, rows, onRow, empty = 'No records', keyField = 'id' }) {
  if (!rows?.length) return <Empty title={empty} icon="list" />;
  return (
    <div className="table-wrap">
      <table className="table responsive">
        <thead>
          <tr>{columns.map((c) => <th key={c.key || c.label} className={c.align === 'right' ? 'r' : ''}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r[keyField] ?? i} className={onRow ? 'clickable' : ''} onClick={onRow ? () => onRow(r) : undefined}>
              {columns.map((c, j) => (
                <td key={c.key || c.label} data-label={c.label} className={`${c.align === 'right' ? 'r num' : ''} ${j === 0 ? 'primary-cell' : ''}`}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const KV = ({ items }) => (
  <dl className="kv">
    {items.filter(Boolean).map(([k, v]) => [<dt key={`k${k}`}>{k}</dt>, <dd key={`v${k}`}>{v}</dd>])}
  </dl>
);

export function PageTitle({ title, sub, children }) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        {sub && <div className="muted small">{sub}</div>}
      </div>
      {children && <div className="row wrap">{children}</div>}
    </div>
  );
}

export function Confirm({ open, title, body, onYes, onClose, yes = 'Confirm', danger }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <p className="muted">{body}</p>
      <div className="row mt-l">
        <Button variant="ghost" className="grow" onClick={onClose}>Cancel</Button>
        <Button variant={danger ? 'danger' : ''} className="grow" onClick={onYes}>{yes}</Button>
      </div>
    </Sheet>
  );
}

export const Notice = ({ tone = 'info', icon = 'alert', children }) => (
  <div className={`notice ${tone}`}><Icon name={icon} size={18} /><div className="grow">{children}</div></div>
);
