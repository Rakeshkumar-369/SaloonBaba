import { useEffect, useState } from 'react';
import { Sheet, Button, Input, Select, Textarea, Check, useAction } from './kit.jsx';

/**
 * Declarative form in a sheet.
 * fields: [{ name, label, type, options, required, placeholder, hint, half, min, max, step }]
 * onSubmit(values) → may return a message string for the toast.
 */
export function FormSheet({ open, onClose, title, fields, initial = {}, onSubmit, submitLabel = 'Save', success = 'Saved', wide, children }) {
  const [values, setValues] = useState(initial);
  const [run, busy] = useAction();
  useEffect(() => {
    if (open) setValues(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const set = (k, v) => setValues((s) => ({ ...s, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    try {
      await run(() => onSubmit(values), success);
      onClose();
    } catch {
      /* toast already shown */
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={title} wide={wide}>
      <form onSubmit={submit} className="col">
        {children}
        <FormFields fields={fields} values={values} set={set} />
        <Button type="submit" busy={busy} className="block lg mt">{submitLabel}</Button>
      </form>
    </Sheet>
  );
}

export function FormFields({ fields, values, set }) {
  const rows = [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (f.half && fields[i + 1]?.half) {
      rows.push(<div key={f.name} className="grid-2">{renderField(f, values, set)}{renderField(fields[i + 1], values, set)}</div>);
      i++;
    } else rows.push(<div key={f.name}>{renderField(f, values, set)}</div>);
  }
  return rows;
}

function renderField(f, values, set) {
  const v = values[f.name] ?? '';
  const common = { name: f.name, required: f.required, placeholder: f.placeholder, label: f.label };
  if (f.type === 'select') return <Select {...common} value={v} options={f.options} placeholder={f.required ? undefined : f.placeholder ?? '—'} onChange={(e) => set(f.name, e.target.value)} />;
  if (f.type === 'textarea') return <Textarea {...common} value={v} onChange={(e) => set(f.name, e.target.value)} />;
  if (f.type === 'checkbox') return <Check label={f.label} checked={Boolean(values[f.name])} onChange={(e) => set(f.name, e.target.checked ? 1 : 0)} />;
  if (f.type === 'file') return <Input label={f.label} type="file" accept={f.accept || 'image/*'} capture={f.capture} onChange={(e) => set(f.name, e.target.files?.[0] || null)} />;
  return <Input {...common} hint={f.hint} type={f.type || 'text'} value={v} min={f.min} max={f.max} step={f.step} inputMode={f.type === 'number' ? 'decimal' : f.inputMode}
    onChange={(e) => set(f.name, f.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)} />;
}
