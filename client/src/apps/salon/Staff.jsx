import { useState } from 'react';
import { useApi, post, patch, put } from '../../lib/api.js';
import { useQueryState } from '../../lib/router.jsx';
import { useSalon } from './SalonApp.jsx';
import { Async, Button, Badge, Tabs, Card, Sheet, Input, useAction, Empty, StatusBadge, Table, Notice, Avatar, Stars, Check, Progress, Textarea } from '../../ui/kit.jsx';
import { FormSheet } from '../../ui/Form.jsx';
import { inr, pct, dateShort, dateDay, cap, time12, today, addDays, ym, monthLabel, DOW, ago } from '../../lib/format.js';

export default function Staff() {
  const { isOwner } = useSalon();
  const [tab, setTab] = useQueryState('tab', 'team');
  const tabs = [['team', 'Team'], ['roster', 'Roster'], ['attendance', 'Attendance'], ['leave', 'Leave & swaps'], ...(isOwner ? [['payroll', 'Payroll'], ['advances', 'Advances']] : []), ['training', 'Training'], ...(isOwner ? [['voice', 'Staff voice']] : [])];
  return (
    <div className="page">
      <h1>Staff & payroll</h1>
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {tab === 'team' && <Team />}
      {tab === 'roster' && <Roster />}
      {tab === 'attendance' && <Attendance />}
      {tab === 'leave' && <Leave />}
      {tab === 'payroll' && isOwner && <Payroll />}
      {tab === 'advances' && isOwner && <Advances />}
      {tab === 'training' && <Training />}
      {tab === 'voice' && isOwner && <Voice />}
    </div>
  );
}

function Team() {
  const { id, isOwner } = useSalon();
  const q = useApi(`/salons/${id}/staff`);
  const services = useApi(`/salons/${id}/services`);
  const [edit, setEdit] = useState(null);
  const [skills, setSkills] = useState(null);
  const [add, setAdd] = useState(false);
  const [run, busy] = useAction();
  return (
    <div className="col">
      {isOwner && <div className="row between"><div className="small muted">Clear rules for pay and promotion keep good stylists longer.</div><Button size="sm" icon="plus" onClick={() => setAdd(true)}>Add staff</Button></div>}
      <Async q={q}>
        {(rows) => (
          <div className="grid-auto">
            {rows.map((s) => (
              <Card key={s.id}>
                <div className="row">
                  <Avatar name={s.name} hue={s.hue} />
                  <div className="grow"><b>{s.name}</b><div className="small muted">{s.title || cap(s.role)} · {cap(s.level)}</div></div>
                  {s.today_status ? <StatusBadge status={s.today_status} /> : <Badge>Not in</Badge>}
                </div>
                <div className="row between mt small"><Stars value={s.rating} count={s.rating_count} /><span className="muted">🏅 {s.badges} badges</span></div>
                {isOwner && s.role !== 'manager' && <div className="small mt">Base {inr(s.base_salary)} · {Number(s.service_commission_pct)}% service · {Number(s.retail_incentive_pct)}% retail · target {inr(s.target_amount, { compact: true })}</div>}
                {s.specialities && <div className="tiny muted mt">{s.specialities}</div>}
                <div className="row mt">
                  {isOwner && <Button size="xs" variant="ghost" onClick={() => setEdit(s)}>Pay & level</Button>}
                  {s.role !== 'manager' && <Button size="xs" variant="ghost" onClick={() => setSkills({ staff: s, ids: String(s.skill_ids || '').split(',').filter(Boolean).map(Number) })}>Skills ({String(s.skill_ids || '').split(',').filter(Boolean).length})</Button>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </Async>
      <FormSheet open={Boolean(edit)} onClose={() => setEdit(null)} title={`Pay rules · ${edit?.name}`} initial={edit || {}}
        onSubmit={(v) => patch(`/salons/${id}/staff/${edit.id}`, v).then(q.reload)}
        fields={[
          { name: 'level', label: 'Level', type: 'select', half: true, options: ['trainee', 'junior', 'senior', 'educator', 'manager'] }, { name: 'title', label: 'Title', half: true },
          { name: 'base_salary', label: 'Base salary ₹/month', type: 'number', half: true }, { name: 'target_amount', label: 'Monthly service target ₹', type: 'number', half: true },
          { name: 'service_commission_pct', label: 'Service commission %', type: 'number', half: true }, { name: 'retail_incentive_pct', label: 'Retail incentive %', type: 'number', half: true },
          { name: 'specialities', label: 'Specialities (shown to customers)' },
          { name: 'is_active', label: 'Active (untick when someone leaves — clients stay with the salon)', type: 'checkbox' },
        ]} />
      <Sheet open={Boolean(skills)} onClose={() => setSkills(null)} title={`Skills · ${skills?.staff.name}`}>
        {skills && (
          <div className="col">
            <div className="small muted">Bookings are only assigned to stylists skilled for the service.</div>
            {(services.data || []).map((sv) => <Check key={sv.id} label={`${sv.name} · ${sv.category}`} checked={skills.ids.includes(sv.id)} onChange={(e) => setSkills({ ...skills, ids: e.target.checked ? [...skills.ids, sv.id] : skills.ids.filter((x) => x !== sv.id) })} />)}
            <Button busy={busy} onClick={() => run(() => put(`/salons/${id}/staff/${skills.staff.id}/skills`, { service_ids: skills.ids }), 'Skills saved').then(() => { setSkills(null); q.reload(); })}>Save skills</Button>
          </div>
        )}
      </Sheet>
      <FormSheet open={add} onClose={() => setAdd(false)} title="Add staff member" submitLabel="Add & send login" initial={{ role: 'stylist', level: 'junior', base_salary: 15000, service_commission_pct: 10, retail_incentive_pct: 5, target_amount: 60000 }}
        success="Added — login sent on WhatsApp" onSubmit={(v) => post(`/salons/${id}/staff`, v).then(q.reload)}
        fields={[
          { name: 'name', label: 'Name', required: true }, { name: 'phone', label: 'Mobile', required: true, half: true }, { name: 'gender', label: 'Gender', type: 'select', half: true, options: [['F', 'Female'], ['M', 'Male'], ['O', 'Other']] },
          { name: 'role', label: 'Role', type: 'select', half: true, options: ['stylist', 'manager', 'receptionist'] }, { name: 'level', label: 'Level', type: 'select', half: true, options: ['trainee', 'junior', 'senior', 'educator'] },
          { name: 'base_salary', label: 'Base salary ₹', type: 'number', half: true }, { name: 'service_commission_pct', label: 'Commission %', type: 'number', half: true },
          { name: 'specialities', label: 'Specialities' },
        ]} />
    </div>
  );
}

function Roster() {
  const { id } = useSalon();
  const monday = addDays(today(), -((new Date().getDay() + 6) % 7));
  const [week, setWeek] = useState(monday);
  const q = useApi(`/salons/${id}/roster?week_start=${week}`);
  const [cell, setCell] = useState(null);
  const [run, busy] = useAction();
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const save = (body) => run(() => put(`/salons/${id}/roster`, body), 'Shift saved — staff notified').then(() => { setCell(null); q.reload(); }).catch(() => {});
  return (
    <div className="col">
      <div className="row between wrap">
        <div className="row gap-s"><Button size="sm" variant="ghost" onClick={() => setWeek(addDays(week, -7))}>‹ Prev</Button><b>{dateShort(week)} – {dateShort(addDays(week, 6))}</b><Button size="sm" variant="ghost" onClick={() => setWeek(addDays(week, 7))}>Next ›</Button></div>
        <Button size="sm" variant="soft" busy={busy} onClick={() => run(() => post(`/salons/${id}/roster/copy-week`, { from_week: addDays(week, -7) }), (r) => `Copied ${r.copied} shifts`).then(q.reload)}>Copy last week</Button>
      </div>
      <Async q={q}>
        {(d) => (
          <div className="card pad-0" style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: 760 }}>
              <thead><tr><th>Staff</th>{days.map((dd) => <th key={dd} className={dd === today() ? 'good' : ''}>{DOW[new Date(dd).getDay()]} {dd.slice(8)}</th>)}</tr></thead>
              <tbody>
                {d.staff.map((s) => (
                  <tr key={s.id}>
                    <td className="nowrap"><b className="small">{s.name}</b><div className="tiny muted">{cap(s.level)}</div></td>
                    {days.map((dd) => {
                      const r = d.roster.find((x) => x.staff_id === s.id && x.date === dd);
                      return (
                        <td key={dd} style={{ cursor: 'pointer' }} onClick={() => setCell({ staff: s, date: dd, r })}>
                          {!r ? <span className="tiny muted">—</span> : r.is_off ? <Badge>Off</Badge> : <span className="tiny nowrap">{time12(r.shift_start)}<br />{time12(r.shift_end)}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td className="tiny muted">Booked hours</td>
                  {days.map((dd) => { const m = d.demand.find((x) => x.d === dd); return <td key={dd} className="tiny">{m ? `${Math.round(m.mins / 60)} h` : '—'}</td>; })}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Async>
      <ShiftSheet cell={cell} onClose={() => setCell(null)} onSave={save} busy={busy} defaults={q.data} />
    </div>
  );
}

function ShiftSheet({ cell, onClose, onSave, busy, defaults }) {
  const [f, setF] = useState(null);
  if (cell && (!f || f.key !== `${cell.staff.id}${cell.date}`))
    setF({ key: `${cell.staff.id}${cell.date}`, is_off: cell.r?.is_off ? 1 : 0, shift_start: (cell.r?.shift_start || defaults?.open_time || '09:00').slice(0, 5), shift_end: (cell.r?.shift_end || defaults?.close_time || '21:00').slice(0, 5) });
  return (
    <Sheet open={Boolean(cell)} onClose={onClose} title={cell ? `${cell.staff.name} · ${dateDay(cell.date)}` : ''}>
      {f && cell && (
        <div className="col">
          <Check label="Weekly off" checked={Boolean(f.is_off)} onChange={(e) => setF({ ...f, is_off: e.target.checked ? 1 : 0 })} />
          {!f.is_off && <div className="grid-2"><Input label="Start" type="time" value={f.shift_start} onChange={(e) => setF({ ...f, shift_start: e.target.value })} /><Input label="End" type="time" value={f.shift_end} onChange={(e) => setF({ ...f, shift_end: e.target.value })} /></div>}
          <Button busy={busy} onClick={() => onSave({ staff_id: cell.staff.id, date: cell.date, is_off: f.is_off, shift_start: f.shift_start, shift_end: f.shift_end })}>Save shift</Button>
        </div>
      )}
    </Sheet>
  );
}

function Attendance() {
  const { id } = useSalon();
  const [date, setDate] = useState(today());
  const q = useApi(`/salons/${id}/attendance?date=${date}`);
  const sum = useApi(`/salons/${id}/attendance/summary?month=${date.slice(0, 7)}`);
  const [run] = useAction();
  const mark = (s, status) => run(() => put(`/salons/${id}/attendance`, { staff_id: s.staff_id, date, status }).then(q.reload), 'Updated');
  return (
    <div className="col">
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <Notice icon="camera">Stylists check in with a selfie and location from the employee app. Check-ins more than 500 m from the salon are blocked.</Notice>
      <Async q={q}>
        {(rows) => (
          <div className="card pad-0">
            <Table rows={rows} keyField="staff_id" columns={[
              { label: 'Staff', key: 'name' },
              { label: 'Shift', render: (r) => (r.is_off ? 'Off' : r.shift_start ? `${time12(r.shift_start)}–${time12(r.shift_end)}` : '—') },
              { label: 'Check-in', render: (r) => (r.check_in ? `${time12(r.check_in)}${r.distance_m !== null ? ` · ${r.distance_m} m` : ''}` : '—') },
              { label: 'Check-out', render: (r) => (r.check_out ? time12(r.check_out) : '—') },
              { label: 'Selfie', render: (r) => (r.selfie_path ? <a href={r.selfie_path} target="_blank" rel="noreferrer">View</a> : '—') },
              { label: 'Status', render: (r) => (r.status ? <StatusBadge status={r.status} /> : <Badge>Not in</Badge>) },
              { label: '', render: (r) => <span className="row gap-s"><button className="btn xs ghost" onClick={() => mark(r, 'present')}>Present</button><button className="btn xs ghost" onClick={() => mark(r, 'absent')}>Absent</button></span> },
            ]} />
          </div>
        )}
      </Async>
      <div className="section-title">{monthLabel(date.slice(0, 7))} summary</div>
      <Async q={sum}>{(rows) => <div className="card pad-0"><Table rows={rows} columns={[{ label: 'Staff', key: 'name' }, { label: 'Present', align: 'right', key: 'present' }, { label: 'Late', align: 'right', key: 'late' }, { label: 'Absent', align: 'right', key: 'absent' }, { label: 'Leave', align: 'right', key: 'leave_days' }, { label: 'Off', align: 'right', key: 'off_days' }]} /></div>}</Async>
    </div>
  );
}

function Leave() {
  const { id } = useSalon();
  const q = useApi(`/salons/${id}/leaves`);
  const [run] = useAction();
  const decide = (l, approve) => run(() => post(`/salons/${id}/leaves/${l.id}/decide`, { approve }).then(q.reload), approve ? 'Approved — roster updated' : 'Rejected');
  return (
    <Async q={q}>
      {(rows) => !rows.length ? <Empty icon="calendar" title="No requests" /> : (
        <div className="col">
          {rows.map((l) => (
            <Card key={l.id}>
              <div className="row between top">
                <div><b>{l.name}</b> <Badge>{l.type === 'swap' ? 'Shift swap' : cap(l.type)}</Badge><div className="small">{dateDay(l.from_date)}{l.to_date !== l.from_date ? ` – ${dateDay(l.to_date)}` : ''}{l.swap_with ? ` · swap with ${l.swap_with}` : ''}</div><div className="small muted">{l.reason}</div></div>
                <StatusBadge status={l.status} />
              </div>
              {l.status === 'pending' && <div className="row mt"><Button size="sm" onClick={() => decide(l, true)}>Approve</Button><Button size="sm" variant="ghost" onClick={() => decide(l, false)}>Reject</Button></div>}
            </Card>
          ))}
        </div>
      )}
    </Async>
  );
}

function Payroll() {
  const { id } = useSalon();
  const [month, setMonth] = useState(ym());
  const q = useApi(`/salons/${id}/payroll?month=${month}`);
  const [run, busy] = useAction();
  const months = Array.from({ length: 4 }, (_, i) => ym(new Date(new Date().getFullYear(), new Date().getMonth() - i, 1)));
  return (
    <div className="col">
      <div className="chips">{months.map((m) => <button key={m} className={`chip ${month === m ? 'active' : ''}`} onClick={() => setMonth(m)}>{monthLabel(m)}</button>)}</div>
      <Async q={q}>
        {(d) => (
          <>
            <div className="kpis">
              <div className="stat"><div className="label">Payroll {d.live ? '(month to date)' : ''}</div><div className="value">{inr(d.total_gross)}</div></div>
              <div className="stat"><div className="label">Net sales</div><div className="value">{inr(d.net_sales, { compact: true })}</div></div>
              <div className="stat"><div className="label">Payroll % of sales</div><div className={`value ${d.payroll_pct > 40 ? 'bad' : d.payroll_pct <= 35 ? 'good' : 'warn'}`}>{pct(d.payroll_pct)}</div><div className="sub">target {d.target_pct}</div></div>
              <div className="stat"><div className="label">Net payable</div><div className="value">{inr(d.total_net)}</div><div className="sub">after advances</div></div>
            </div>
            <div className="card pad-0">
              <Table rows={d.rows} keyField="staff_id" columns={[
                { label: 'Staff', render: (r) => <span>{r.name}<div className="tiny muted">{cap(r.level)} · {r.days_paid}/{r.days_in_month} days</div></span> },
                { label: 'Base', align: 'right', render: (r) => inr(r.base) },
                { label: 'Service sales', align: 'right', render: (r) => inr(r.service_revenue, { compact: true }) },
                { label: 'Commission', align: 'right', render: (r) => inr(r.commission) },
                { label: 'Retail', align: 'right', render: (r) => inr(r.retail_incentive) },
                { label: 'Slab bonus', align: 'right', render: (r) => inr(r.slab_bonus) },
                { label: 'Tips', align: 'right', render: (r) => inr(r.tips) },
                { label: 'Advance', align: 'right', render: (r) => (r.advances ? `−${inr(r.advances)}` : '—') },
                { label: 'Net', align: 'right', render: (r) => <b>{inr(r.net)}</b> },
                { label: 'Slip', render: (r) => (r.slip ? <StatusBadge status={r.slip.status} /> : d.live ? <Badge>Live</Badge> : <Badge>Draft</Badge>) },
              ]} />
            </div>
            {d.live ? <Notice icon="clock">This month is still running — stylists see these numbers live in their earnings wallet. Finalise after month end.</Notice> : (
              <div className="row"><Button busy={busy} onClick={() => run(() => post(`/salons/${id}/payroll/finalise`, { month }), 'Payroll finalised and booked as salary expense').then(q.reload)}>Finalise payroll</Button><Button variant="soft" icon="whatsapp" busy={busy} onClick={() => run(() => post(`/salons/${id}/payroll/send`, { month }), (r) => `${r.sent} payslips sent on WhatsApp`).then(q.reload)}>Send payslips</Button></div>
            )}
          </>
        )}
      </Async>
    </div>
  );
}

function Advances() {
  const { id } = useSalon();
  const q = useApi(`/salons/${id}/advances`);
  const staff = useApi(`/salons/${id}/staff`);
  const [add, setAdd] = useState(false);
  return (
    <div className="col">
      <div className="row between"><div className="small muted">Advances are deducted in the next payslip automatically.</div><Button size="sm" icon="plus" onClick={() => setAdd(true)}>Record advance</Button></div>
      <Async q={q}>{(rows) => <div className="card pad-0"><Table rows={rows} columns={[{ label: 'Staff', key: 'name' }, { label: 'Amount', align: 'right', render: (r) => inr(r.amount) }, { label: 'Given', render: (r) => dateShort(r.given_on) }, { label: 'Note', key: 'note' }, { label: 'Recovered', render: (r) => (r.recovered_in ? monthLabel(r.recovered_in) : <Badge tone="warn">Pending</Badge>) }]} empty="No advances" /></div>}</Async>
      <FormSheet open={add} onClose={() => setAdd(false)} title="Salary advance" initial={{ given_on: today() }} onSubmit={(v) => post(`/salons/${id}/advances`, v).then(q.reload)}
        fields={[{ name: 'staff_id', label: 'Staff', type: 'select', required: true, options: (staff.data || []).map((s) => [s.id, s.name]) }, { name: 'amount', label: 'Amount ₹', type: 'number', required: true, half: true }, { name: 'given_on', label: 'Date', type: 'date', half: true }, { name: 'note', label: 'Note' }]} />
    </div>
  );
}

function Training() {
  const { id } = useSalon();
  const q = useApi(`/salons/${id}/training`);
  return (
    <Async q={q}>
      {(rows) => {
        const by = {};
        for (const r of rows) (by[r.name] ||= []).push(r);
        return !rows.length ? <Empty icon="book" title="No courses yet" /> : (
          <div className="grid-auto">
            {Object.entries(by).map(([name, list]) => (
              <Card key={name} title={name}>
                {list.map((c) => <div key={c.title} className="col gap-s" style={{ marginBottom: 8 }}><div className="row between small"><span>{c.title}</span>{c.completed_at ? <Badge tone="good">🏅 {c.badge_name || 'Done'}</Badge> : <span className="muted">{c.progress}%</span>}</div><Progress value={c.progress} /></div>)}
              </Card>
            ))}
          </div>
        );
      }}
    </Async>
  );
}

function Voice() {
  const { id } = useSalon();
  const q = useApi(`/salons/${id}/voice`);
  const [reply, setReply] = useState({});
  const [run] = useAction();
  return (
    <div className="col">
      <Notice icon="message">Staff can raise concerns anonymously. Early warnings here prevent resignations.</Notice>
      <Async q={q}>
        {(rows) => !rows.length ? <Empty title="No feedback yet" /> : rows.map((v) => (
          <Card key={v.id}>
            <div className="row between"><Badge>{cap(v.category)}</Badge><span className="tiny muted">{v.from_name || 'Anonymous'} · {ago(v.created_at)}</span></div>
            <p className="mt">{v.message}</p>
            {v.reply ? <div className="small good">Reply: {v.reply}</div> : (
              <div className="row"><Textarea placeholder="Reply / action taken" value={reply[v.id] || ''} onChange={(e) => setReply({ ...reply, [v.id]: e.target.value })} style={{ minHeight: 44 }} /><Button size="sm" onClick={() => run(() => patch(`/salons/${id}/voice/${v.id}`, { status: 'resolved', reply: reply[v.id] }).then(q.reload), 'Saved')}>Save</Button></div>
            )}
            <div className="mt"><StatusBadge status={v.status === 'resolved' ? 'closed' : v.status} /></div>
          </Card>
        ))}
      </Async>
    </div>
  );
}

