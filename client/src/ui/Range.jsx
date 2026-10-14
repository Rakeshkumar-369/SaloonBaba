import { Chips } from './kit.jsx';
import { today, addDays, ym } from '../lib/format.js';

export const RANGES = [['today', 'Today'], ['7', '7 days'], ['30', '30 days'], ['month', 'This month'], ['90', '90 days']];

export function rangeOf(key) {
  const t = today();
  if (key === 'today') return { from: t, to: t };
  if (key === 'month') return { from: `${ym()}-01`, to: t };
  return { from: addDays(t, -(Number(key) - 1)), to: t };
}
export const rangeQs = (key) => {
  const r = rangeOf(key);
  return `from=${r.from}&to=${r.to}`;
};

export default function RangeChips({ value, onChange, options = RANGES }) {
  return <Chips items={options} value={value} onChange={onChange} />;
}
