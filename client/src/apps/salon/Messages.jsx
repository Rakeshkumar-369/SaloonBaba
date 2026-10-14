import { useState } from 'react';
import { useApi } from '../../lib/api.js';
import { useSalon } from './SalonApp.jsx';
import { Async, Table, Badge, Chips, Notice, StatusBadge } from '../../ui/kit.jsx';
import RangeChips, { rangeQs } from '../../ui/Range.jsx';
import { dateTime, cap } from '../../lib/format.js';

const TEMPLATES = [['', 'All'], ['invoice', 'Bills'], ['booking_confirm', 'Bookings'], ['appt_reminder', 'Reminders'], ['thank_you', 'Thank-you'], ['due_', 'Due reminders'], ['win_back', 'Win-back'], ['campaign_', 'Campaigns'], ['payslip', 'Payslips'], ['approval_otp', 'OTPs']];

export default function Messages() {
  const { id } = useSalon();
  const [range, setRange] = useState('7');
  const [t, setT] = useState('');
  const q = useApi(`/salons/${id}/messages?${rangeQs(range)}${t ? `&template=${t}` : ''}`);
  return (
    <div className="page">
      <h1>Messages</h1>
      <Notice icon="whatsapp">Every WhatsApp/SMS sent by SaloonBaba from your number. In demo mode messages are <b>simulated</b>; add WhatsApp Cloud API / MSG91 keys to send for real.</Notice>
      <div className="mt"><RangeChips value={range} onChange={setRange} /></div>
      <div className="mt"><Chips items={TEMPLATES} value={t} onChange={setT} /></div>
      <Async q={q}>
        {(rows) => (
          <div className="card pad-0 mt">
            <Table rows={rows} columns={[
              { label: 'To', render: (m) => <span>{m.to_name || '—'}<div className="tiny muted">{m.to_phone}</div></span> },
              { label: 'Type', render: (m) => <Badge>{cap(m.template.replace(/_\d.*$/, ''))}</Badge> },
              { label: 'Message', render: (m) => <span className="small">{m.body}</span> },
              { label: 'Channel', render: (m) => cap(m.channel) },
              { label: 'Status', render: (m) => <StatusBadge status={m.status} /> },
              { label: 'When', render: (m) => dateTime(m.created_at) },
            ]} empty="No messages" />
          </div>
        )}
      </Async>
    </div>
  );
}
