import { config } from '../config.js';

/**
 * WhatsApp Cloud API (Meta). Sends a plain text message.
 * In production, business-initiated messages outside the 24h window need an
 * approved template; set WHATSAPP_TEMPLATE_* and use sendTemplate().
 */
export const whatsappLive = () => Boolean(config.whatsapp.token && config.whatsapp.phoneNumberId);

const toE164 = (phone) => {
  const digits = String(phone).replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
};

async function call(payload) {
  const url = `https://graph.facebook.com/v21.0/${config.whatsapp.phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.whatsapp.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `WhatsApp API error ${res.status}`);
  return data?.messages?.[0]?.id || '';
}

export function sendText(phone, body) {
  return call({ to: toE164(phone), type: 'text', text: { preview_url: true, body } });
}

export function sendTemplate(phone, name, params = [], lang = 'en') {
  return call({
    to: toE164(phone),
    type: 'template',
    template: {
      name,
      language: { code: lang },
      components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text: String(text) })) }],
    },
  });
}
