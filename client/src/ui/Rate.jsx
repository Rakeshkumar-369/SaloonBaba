/** Tap-to-rate 1–5 stars. */
export default function Rate({ label, value, onChange }) {
  return (
    <div className="row between">
      <span className="small">{label}</span>
      <div className="row gap-s" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} onClick={() => onChange(n)}
            style={{ border: 0, background: 'none', fontSize: 24, cursor: 'pointer', color: n <= value ? '#f59e0b' : 'var(--border)', padding: 0 }}>★</button>
        ))}
      </div>
    </div>
  );
}

export const RATING_KEYS = [['result', 'Result'], ['hygiene', 'Hygiene'], ['wait', 'Waiting time'], ['value', 'Value for money'], ['behaviour', 'Staff behaviour']];
