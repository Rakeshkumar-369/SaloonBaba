import { config } from '../config.js';

/** MSG91 Flow API (DLT-approved template required in India). */
export const smsLive = () => Boolean(config.msg91.authKey);

export async function sendSms(phone, body) {
  const digits = String(phone).replace(/\D/g, '');
  const res = await fetch('https://control.msg91.com/api/v5/flow/', {
    method: 'POST',
    headers: { authkey: config.msg91.authKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template_id: config.msg91.templateId,
      sender: config.msg91.senderId,
      short_url: '1',
      recipients: [{ mobiles: digits.length === 10 ? `91${digits}` : digits, message: body }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.type === 'error') throw new Error(data.message || `MSG91 error ${res.status}`);
  return data.request_id || data.message || '';
}
