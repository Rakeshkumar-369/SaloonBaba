import { useState } from 'react';
import { useApi, api, patch } from '../../lib/api.js';
import { useQueryState } from '../../lib/router.jsx';
import { useSalon } from './SalonApp.jsx';
import { Async, Card, Button, Badge, Check, Tabs, Input, useAction, Empty, StatusBadge, Notice, Progress } from '../../ui/kit.jsx';
import { dateShort, dateDay, today, ago } from '../../lib/format.js';

export default function Checklists() {
  const [tab, setTab] = useQueryState('tab', 'today');
  return (
    <div className="page">
      <h1>Hygiene, SOP & audits</h1>
      <Tabs value={tab} onChange={setTab} tabs={[['today', 'Today’s checklists'], ['audits', 'Brand audits & actions']]} />
      {tab === 'today' ? <Today /> : <Audits />}
    </div>
  );
}

function Today() {
  const { id } = useSalon();
  const [date, setDate] = useState(today());
  const q = useApi(`/salons/${id}/checklists?date=${date}`);
  return (
    <Async q={q}>
      {(d) => (
        <div className="col">
          <Card>
            <div className="row between"><div><div className="small muted">Hygiene score (last 14 days)</div><b style={{ fontSize: 28 }} className={d.hygiene_score >= 85 ? 'good' : 'warn'}>{d.hygiene_score}/100</b></div>{d.hygiene_score >= 85 ? <Badge tone="good">Badge shown on customer app</Badge> : <Badge tone="warn">Below 85 — badge hidden</Badge>}</div>
            <div className="row gap-s mt" style={{ alignItems: 'flex-end', height: 50 }}>
              {[...d.history].reverse().map((h) => <div key={h.run_date} title={`${dateShort(h.run_date)}: ${h.score}`} style={{ flex: 1, height: `${h.score / 2}px`, background: h.score >= 85 ? 'var(--good)' : 'var(--warn)', borderRadius: 3 }} />)}
            </div>
          </Card>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          {d.templates.map((t) => <ChecklistCard key={`${t.id}-${date}`} t={t} date={date} onDone={q.reload} />)}
        </div>
      )}
    </Async>
  );
}

function ChecklistCard({ t, date, onDone }) {
  const { id } = useSalon();
  const done = t.run ? (typeof t.run.items === 'string' ? JSON.parse(t.run.items) : t.run.items) : null;
  const [checked, setChecked] = useState(done ? done.map((x, i) => (x.done ? i : -1)).filter((i) => i >= 0) : []);
  const [photo, setPhoto] = useState(null);
  const [run, busy] = useAction();
  const submit = () => run(async () => {
    const form = new FormData();
    form.append('checked', JSON.stringify(checked));
    form.append('date', date);
    if (photo) form.append('photo', photo);
    return api(`/salons/${id}/checklists/${t.id}/run`, { method: 'POST', form });
  }, (r) => `Saved · score ${r.score}%`).then(onDone).catch(() => {});
  return (
    <Card title={t.name} action={t.run ? <Badge tone={t.run.score >= 85 ? 'good' : 'warn'}>{t.run.score}% · {t.run.done_by_name}</Badge> : t.from_brand ? <Badge tone="primary">Brand SOP</Badge> : null}>
      <div className="col gap-s">
        {t.items.map((label, i) => <Check key={label} label={label} checked={checked.includes(i)} onChange={(e) => setChecked(e.target.checked ? [...checked, i] : checked.filter((x) => x !== i))} />)}
      </div>
      <Progress value={checked.length} max={t.items.length} />
      <div className="row mt wrap">
        <label className="btn ghost sm" style={{ cursor: 'pointer' }}>📷 {photo ? photo.name.slice(0, 18) : t.run?.photo_path ? 'Replace photo' : 'Photo proof'}<input type="file" accept="image/*" capture="environment" hidden onChange={(e) => setPhoto(e.target.files?.[0] || null)} /></label>
        {t.run?.photo_path && <a className="small" href={t.run.photo_path} target="_blank" rel="noreferrer">View photo</a>}
        <Button size="sm" busy={busy} onClick={submit}>{t.run ? 'Update' : 'Submit'}</Button>
      </div>
    </Card>
  );
}

function Audits() {
  const { id } = useSalon();
  const q = useApi(`/salons/${id}/audit-actions`);
  const [note, setNote] = useState({});
  const [run] = useAction();
  const set = (a, status) => run(() => patch(`/salons/${id}/audit-actions/${a.id}`, { status, outlet_note: note[a.id] || a.outlet_note }).then(q.reload), 'Updated');
  return (
    <Async q={q}>
      {(d) => !d.audits.length ? <Empty icon="clipboard" title="No brand audits">Independent salon? Use the daily checklists to keep your hygiene badge.</Empty> : (
        <div className="col">
          <div className="grid-auto">
            {d.audits.map((a) => <Card key={a.id}><div className="row between"><b>{dateDay(a.audit_date)}</b><Badge tone={a.score >= 80 ? 'good' : 'bad'}>{a.score}%</Badge></div><div className="small muted">by {a.auditor}</div><div className="small mt">{a.summary}</div></Card>)}
          </div>
          <div className="section-title">Action items</div>
          {d.actions.map((a) => (
            <Card key={a.id}>
              <div className="row between top"><div><b className="small">{a.title}</b><div className="tiny muted">Due {dateShort(a.due_date)}{a.closed_at ? ` · closed ${ago(a.closed_at)}` : ''}</div></div><StatusBadge status={a.status} /></div>
              {a.status !== 'closed' && (
                <div className="row mt">
                  <Input placeholder="What did you do?" value={note[a.id] ?? a.outlet_note ?? ''} onChange={(e) => setNote({ ...note, [a.id]: e.target.value })} />
                  {a.status === 'open' && <Button size="sm" variant="ghost" onClick={() => set(a, 'in_progress')}>Started</Button>}
                  <Button size="sm" onClick={() => set(a, 'closed')}>Done</Button>
                </div>
              )}
            </Card>
          ))}
          <Notice>Area managers verify closed items on the next visit.</Notice>
        </div>
      )}
    </Async>
  );
}
