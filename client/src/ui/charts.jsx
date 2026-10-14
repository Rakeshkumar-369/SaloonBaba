// Lightweight SVG charts (no chart library).
import { useState } from 'react';
import { inr, dateShort, DOW } from '../lib/format.js';

const C = { primary: 'var(--primary)', accent: 'var(--accent)', muted: 'var(--border)' };

/** Vertical bars with optional line overlay. data: [{label, value, value2}] */
export function Bars({ data, height = 160, format = (v) => inr(v, { compact: true }), color = C.primary, showEvery }) {
  const [hover, setHover] = useState(null);
  if (!data?.length) return null;
  const max = Math.max(1, ...data.map((d) => Number(d.value) || 0));
  const w = 100 / data.length;
  const every = showEvery || Math.ceil(data.length / 7);
  const h = hover !== null ? data[hover] : null;
  return (
    <div>
      <div className="row between small" style={{ minHeight: 20 }}>
        <span className="muted">{h ? h.label : ' '}</span>
        <b className="num">{h ? format(h.value) : ''}</b>
      </div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" width="100%" height={height} onMouseLeave={() => setHover(null)} role="img" aria-label="Bar chart">
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2="100" y1={height * f} y2={height * f} stroke="var(--border)" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />)}
        {data.map((d, i) => {
          const bh = ((Number(d.value) || 0) / max) * (height - 4);
          return (
            <rect key={i} x={i * w + w * 0.15} width={w * 0.7} y={height - bh} height={Math.max(0.5, bh)} rx="0.8"
              fill={hover === i ? C.accent : color} opacity={hover === null || hover === i ? 1 : 0.55}
              onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} onTouchStart={() => setHover(i)} />
          );
        })}
      </svg>
      <div className="row between tiny muted" style={{ marginTop: 4 }}>
        {data.map((d, i) => (i % every === 0 ? <span key={i}>{d.short ?? d.label}</span> : null))}
      </div>
    </div>
  );
}

/** Revenue series helper: [{date, revenue}] -> Bars */
export const RevenueBars = ({ series, height }) => (
  <Bars height={height} data={series.map((s) => ({ label: dateShort(s.date), short: dateShort(s.date).split(' ')[0], value: s.revenue }))} />
);

/** Horizontal bars list. items: [{label, value, sub}] */
export function HBars({ items, format = (v) => inr(v, { compact: true }), color = C.primary }) {
  const max = Math.max(1, ...items.map((i) => Number(i.value) || 0));
  return (
    <div className="col gap-s">
      {items.map((it, i) => (
        <div key={i}>
          <div className="row between small"><span className="ellipsis">{it.label}</span><b className="num">{format(it.value)}</b></div>
          <div className="progress" style={{ height: 7 }}><i style={{ width: `${(Number(it.value) / max) * 100}%`, background: it.color || color }} /></div>
          {it.sub && <div className="tiny muted">{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}

/** Donut. parts: [{label, value, color}] */
export function Donut({ parts, size = 120, label }) {
  const total = parts.reduce((t, p) => t + Number(p.value || 0), 0) || 1;
  let acc = 0;
  const r = 15.915;
  return (
    <div className="row gap-l">
      <svg width={size} height={size} viewBox="0 0 42 42" role="img" aria-label={label}>
        <circle cx="21" cy="21" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="6" />
        {parts.map((p, i) => {
          const v = (Number(p.value) / total) * 100;
          const el = <circle key={i} cx="21" cy="21" r={r} fill="none" stroke={p.color} strokeWidth="6" strokeDasharray={`${v} ${100 - v}`} strokeDashoffset={25 - acc} />;
          acc += v;
          return el;
        })}
        {label && <text x="21" y="22.5" textAnchor="middle" fontSize="5" fontWeight="700" fill="var(--text)">{label}</text>}
      </svg>
      <div className="col gap-s small">
        {parts.map((p) => (
          <div key={p.label} className="row gap-s"><i style={{ width: 10, height: 10, borderRadius: 3, background: p.color, display: 'inline-block' }} />{p.label} <b className="num">{Math.round((p.value / total) * 100)}%</b></div>
        ))}
      </div>
    </div>
  );
}

/** Weekday × hour heatmap. heat: {open, close, grid:[{dow,h,pct}]} */
export function Heatmap({ heat }) {
  const hours = [];
  for (let h = heat.open; h < heat.close; h++) hours.push(h);
  const order = [1, 2, 3, 4, 5, 6, 0];
  const color = (p) => `hsl(${265 - p * 1.1} 70% ${92 - p * 0.45}%)`;
  return (
    <div style={{ overflowX: 'auto' }}>
      <div className="heat" style={{ gridTemplateColumns: `34px repeat(${hours.length}, minmax(22px, 1fr))`, minWidth: 34 + hours.length * 24 }}>
        <div />
        {hours.map((h) => <div key={h} className="center muted">{h > 12 ? h - 12 : h}</div>)}
        {order.map((dow) => [
          <div key={`l${dow}`} className="muted" style={{ alignSelf: 'center' }}>{DOW[dow]}</div>,
          ...hours.map((h) => {
            const c = heat.grid.find((g) => g.dow === dow && g.h === h);
            return <div key={`${dow}-${h}`} className="c" style={{ background: color(c?.pct || 0) }} title={`${DOW[dow]} ${h}:00 — ${c?.pct || 0}% full`}>{c?.pct ?? 0}</div>;
          }),
        ])}
      </div>
      <div className="legend mt"><span><i style={{ background: color(10) }} />Quiet</span><span><i style={{ background: color(50) }} />Busy</span><span><i style={{ background: color(90) }} />Full</span></div>
    </div>
  );
}

/** Sparkline */
export function Spark({ values, width = 90, height = 26, color = C.primary }) {
  if (!values?.length) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * width},${height - ((v - min) / (max - min || 1)) * height}`).join(' ');
  return <svg width={width} height={height}><polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" /></svg>;
}

/** Line chart with two series. series: [{label, values, color}] labels: [] */
export function Lines({ labels, series, height = 150, format = (v) => inr(v, { compact: true }) }) {
  const all = series.flatMap((s) => s.values);
  const max = Math.max(1, ...all);
  const min = Math.min(0, ...all);
  const x = (i) => (i / Math.max(1, labels.length - 1)) * 100;
  const y = (v) => height - ((v - min) / (max - min || 1)) * (height - 8) - 4;
  const every = Math.ceil(labels.length / 6);
  return (
    <div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" width="100%" height={height}>
        {min < 0 && <line x1="0" x2="100" y1={y(0)} y2={y(0)} stroke="var(--muted)" strokeDasharray="1 1" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />}
        {series.map((s) => <polyline key={s.label} points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
      </svg>
      <div className="row between tiny muted">{labels.map((l, i) => (i % every === 0 ? <span key={i}>{l}</span> : null))}</div>
      <div className="legend mt">{series.map((s) => <span key={s.label}><i style={{ background: s.color }} />{s.label} · {format(s.values.reduce((t, v) => t + v, 0))}</span>)}</div>
    </div>
  );
}
