import { useState } from 'react';
import { useApi, post, patch, del } from '../../lib/api.js';
import { useQueryState } from '../../lib/router.jsx';
import { useSalon } from './SalonApp.jsx';
import { Async, Card, Button, Badge, Tabs, Input, Select, Textarea, Check, useAction, Table, Notice, KV } from '../../ui/kit.jsx';
import { FormSheet } from '../../ui/Form.jsx';
import Icon from '../../ui/Icon.jsx';
import { inr, cap } from '../../lib/format.js';

export default function Settings() {
  const [tab, setTab] = useQueryState('tab', 'profile');
  return (
    <div className="page">
      <h1>Settings</h1>
      <Tabs value={tab} onChange={setTab} tabs={[['profile', 'Salon profile'], ['menu', 'Service menu'], ['booking', 'Booking channels'], ['chairs', 'Chairs & rooms']]} />
      {tab === 'profile' && <Profile />}
      {tab === 'menu' && <Menu />}
      {tab === 'booking' && <Channels />}
      {tab === 'chairs' && <Chairs />}
    </div>
  );
}

function Profile() {
  const { id, isOwner, reloadSalon } = useSalon();
  const q = useApi(`/salons/${id}/settings`);
  const [f, setF] = useState(null);
  const [run, busy] = useAction();
  return (
    <Async q={q}>
      {(d) => {
        const v = f || d.salon;
        const set = (k, val) => setF({ ...v, [k]: val });
        const save = () => run(() => patch(`/salons/${id}/settings`, v), 'Saved').then(() => { setF(null); q.reload(); reloadSalon(); });
        return (
          <div className="col">
            {!isOwner && <Notice icon="lock">Only the owner can change these settings.</Notice>}
            <Card title="Profile shown on the customer app">
              <div className="col">
                <Input label="Salon name" value={v.name} onChange={(e) => set('name', e.target.value)} disabled={!isOwner} />
                <Input label="Tagline" value={v.tagline || ''} onChange={(e) => set('tagline', e.target.value)} disabled={!isOwner} />
                <Textarea label="About" value={v.description || ''} onChange={(e) => set('description', e.target.value)} disabled={!isOwner} />
                <div className="grid-2"><Input label="Opens" type="time" value={v.open_time.slice(0, 5)} onChange={(e) => set('open_time', e.target.value)} disabled={!isOwner} /><Input label="Closes" type="time" value={v.close_time.slice(0, 5)} onChange={(e) => set('close_time', e.target.value)} disabled={!isOwner} /></div>
                <div className="grid-2">
                  <Select label="For" value={v.gender_type} onChange={(e) => set('gender_type', e.target.value)} options={['unisex', 'women', 'men']} disabled={!isOwner} />
                  <Select label="Price level" value={v.price_level} onChange={(e) => set('price_level', Number(e.target.value))} options={[[1, '₹ Budget'], [2, '₹₹ Mid'], [3, '₹₹₹ Premium'], [4, '₹₹₹₹ Luxury']]} disabled={!isOwner} />
                </div>
                <div className="row wrap gap-l">
                  {[['women_staff', 'Women staff available'], ['private_rooms', 'Private rooms'], ['home_service', 'Home service'], ['gold_partner', 'SaloonBaba Gold partner']].map(([k, l]) => <Check key={k} label={l} checked={Boolean(v[k])} disabled={!isOwner} onChange={(e) => set(k, e.target.checked ? 1 : 0)} />)}
                </div>
              </div>
            </Card>
            <Card title="Policies">
              <div className="grid-2">
                <Input label="Deposit % for new clients / long services" type="number" value={v.deposit_pct} onChange={(e) => set('deposit_pct', Number(e.target.value))} disabled={!isOwner} />
                <Input label="Long service = minutes ≥" type="number" value={v.deposit_min_duration} onChange={(e) => set('deposit_min_duration', Number(e.target.value))} disabled={!isOwner} />
              </div>
              <Input label="Discount above this % needs owner OTP" type="number" value={v.discount_limit_pct} onChange={(e) => set('discount_limit_pct', Number(e.target.value))} disabled={!isOwner} />
            </Card>
            <Card title="Billing & payments">
              <div className="grid-2"><Input label="GSTIN" value={v.gst_number || ''} onChange={(e) => set('gst_number', e.target.value)} disabled={!isOwner} /><Input label="UPI ID (for counter QR)" value={v.upi_id || ''} onChange={(e) => set('upi_id', e.target.value)} disabled={!isOwner} /></div>
              <div className="grid-2"><Input label="Phone" value={v.phone || ''} onChange={(e) => set('phone', e.target.value)} disabled={!isOwner} /><Input label="WhatsApp number" value={v.whatsapp || ''} onChange={(e) => set('whatsapp', e.target.value)} disabled={!isOwner} /></div>
            </Card>
            {d.brand && <Notice icon="building">Franchise of {d.brand.name} · royalty {Number(d.brand.royalty_pct)}% + marketing {Number(d.brand.marketing_fee_pct)}%</Notice>}
            {isOwner && <Button className="lg" busy={busy} disabled={!f} onClick={save}>Save changes</Button>}
          </div>
        );
      }}
    </Async>
  );
}

function Menu() {
  const { id, isOwner, access } = useSalon();
  const q = useApi(`/salons/${id}/services?all=1`);
  const [edit, setEdit] = useState(null);
  const canEdit = isOwner || access === 'manager';
  return (
    <div className="col">
      <div className="row between"><div className="small muted">Prices include GST and are shown on the customer app.</div>{canEdit && <Button size="sm" icon="plus" onClick={() => setEdit({ gender: 'unisex' })}>Add service</Button>}</div>
      <Async q={q}>
        {(rows) => (
          <div className="card pad-0">
            <Table rows={rows} onRow={canEdit ? setEdit : undefined} columns={[
              { label: 'Service', render: (s) => <span>{s.name}{!s.is_active && <Badge>Hidden</Badge>}<div className="tiny muted">{s.category} · {s.duration_min} min{s.cycle_days ? ` · due every ${s.cycle_days} d` : ''}</div></span> },
              { label: 'Price', align: 'right', render: (s) => <b>{inr(s.price)}</b> },
              { label: 'Brand', render: (s) => (s.brand_service_id ? <Badge tone={s.allow_override ? 'info' : 'primary'}>{s.allow_override ? 'Brand · local price' : 'Brand · locked'}</Badge> : '—') },
              { label: 'Skilled', align: 'right', key: 'skilled_staff' },
              { label: 'Recipe', render: (s) => (s.recipe_items ? <Badge tone="good">{s.recipe_items} items</Badge> : '—') },
            ]} />
          </div>
        )}
      </Async>
      <FormSheet open={Boolean(edit)} onClose={() => setEdit(null)} title={edit?.id ? `Edit ${edit.name}` : 'Add service'} initial={edit || {}}
        onSubmit={(v) => (edit.id ? patch(`/salons/${id}/services/${edit.id}`, v) : post(`/salons/${id}/services`, v)).then(q.reload)}
        fields={[
          { name: 'name', label: 'Name', required: true }, { name: 'category', label: 'Category', required: true, half: true }, { name: 'gender', label: 'For', type: 'select', half: true, options: ['unisex', 'women', 'men'] },
          { name: 'price', label: 'Price ₹ (incl. GST)', type: 'number', required: true, half: true }, { name: 'duration_min', label: 'Duration (min)', type: 'number', required: true, half: true },
          { name: 'cycle_days', label: 'Remind client after (days)', type: 'number', hint: 'e.g. root touch-up 35, threading 18' },
          { name: 'tags', label: 'Search tags', hint: 'comma separated, e.g. curly hair, bridal' }, { name: 'description', label: 'Description', type: 'textarea' },
          ...(edit?.id ? [{ name: 'is_active', label: 'Show on menu', type: 'checkbox' }] : []),
        ]}>
        {edit?.brand_service_id && !edit.allow_override ? <Notice tone="warn" icon="lock">Name and price are set by brand HQ for this service.</Notice> : null}
      </FormSheet>
    </div>
  );
}

function Channels() {
  const { id, salon } = useSalon();
  const q = useApi(`/salons/${id}/settings`);
  const link = `${location.origin}/s/${salon.slug}`;
  const [reply, setReply] = useState('');
  const [text, setText] = useState(`QUEUE ${salon.slug}`);
  const sim = async () => setReply((await post('/integrations/whatsapp/simulate', { text })).reply);
  return (
    <Async q={q}>
      {(d) => (
        <div className="col">
          <Card title="One link for Instagram bio, Google profile and WhatsApp">
            <div className="row"><Input value={link} readOnly /><Button variant="soft" onClick={() => navigator.clipboard?.writeText(link)}>Copy</Button></div>
            <div className="small muted mt">Opens your menu, live wait time and booking — no app download needed.</div>
          </Card>
          <Card title="Integrations">
            <KV items={[['WhatsApp Cloud API', <Badge key="w" tone={d.integrations.whatsapp === 'live' ? 'good' : 'info'}>{cap(d.integrations.whatsapp)}</Badge>], ['SMS (MSG91)', <Badge key="s" tone={d.integrations.sms === 'live' ? 'good' : 'info'}>{cap(d.integrations.sms)}</Badge>], ['UPI / cards (Razorpay)', <Badge key="p" tone={d.integrations.payments === 'live' ? 'good' : 'info'}>{cap(d.integrations.payments)}</Badge>]]} />
            <div className="tiny muted mt">Simulated = messages are logged in Messages and payments use a demo checkout. Add API keys in the server <code>.env</code> to go live.</div>
          </Card>
          <Card title="WhatsApp booking bot — try it">
            <div className="small muted mb">Clients message your WhatsApp number: MENU, QUEUE, JOIN, BOOK.</div>
            <div className="row"><Input value={text} onChange={(e) => setText(e.target.value)} /><Button icon="send" onClick={sim}>Send</Button></div>
            {reply && <div className="card flat mt" style={{ background: 'var(--good-soft)', whiteSpace: 'pre-wrap' }}><Icon name="whatsapp" size={16} /> {reply}</div>}
          </Card>
        </div>
      )}
    </Async>
  );
}

function Chairs() {
  const { id, access, isOwner } = useSalon();
  const q = useApi(`/salons/${id}/settings`);
  const [name, setName] = useState('');
  const [type, setType] = useState('chair');
  const [run] = useAction();
  const can = isOwner || access === 'manager';
  return (
    <Async q={q}>
      {(d) => (
        <div className="col">
          <Card>
            {d.chairs.map((c) => <div key={c.id} className="row between" style={{ padding: '6px 0' }}><span>{c.name} <Badge>{cap(c.type)}</Badge></span>{can && <button className="btn xs ghost" onClick={() => run(() => del(`/salons/${id}/chairs/${c.id}`).then(q.reload), 'Removed')}>Remove</button>}</div>)}
          </Card>
          {can && <div className="row"><Input placeholder="Chair 7" value={name} onChange={(e) => setName(e.target.value)} /><Select value={type} onChange={(e) => setType(e.target.value)} options={['chair', 'room', 'station']} /><Button onClick={() => run(() => post(`/salons/${id}/chairs`, { name, type }).then(() => { setName(''); q.reload(); }), 'Added')} disabled={!name}>Add</Button></div>}
        </div>
      )}
    </Async>
  );
}

