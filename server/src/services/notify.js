import { insert, one, q } from '../db.js';
import { now } from '../util.js';
import { whatsappLive, sendText } from '../integrations/whatsapp.js';
import { smsLive, sendSms } from '../integrations/sms.js';

/**
 * Send a WhatsApp/SMS message to a phone and record it in message_log.
 * Without API keys, messages are "simulated": logged and visible in the
 * Messages screen, so the whole flow can be demoed end to end.
 */
export async function sendMessage({
  salonId = null,
  channel = 'whatsapp',
  to,
  name = '',
  template = 'custom',
  body,
  refType = null,
  refId = null,
  at = null,
}) {
  let status = 'simulated';
  let provider = 'simulator';
  let providerRef = null;
  let error = null;
  const live = channel === 'whatsapp' ? whatsappLive() : channel === 'sms' ? smsLive() : false;
  if (live && to) {
    try {
      providerRef = channel === 'whatsapp' ? await sendText(to, body) : await sendSms(to, body);
      provider = channel === 'whatsapp' ? 'whatsapp_cloud' : 'msg91';
      status = 'sent';
    } catch (e) {
      status = 'failed';
      provider = channel === 'whatsapp' ? 'whatsapp_cloud' : 'msg91';
      error = String(e.message).slice(0, 290);
    }
  }
  const id = await insert('message_log', {
    salon_id: salonId,
    channel,
    to_phone: to,
    to_name: name,
    template,
    body,
    status,
    provider,
    provider_ref: providerRef,
    error,
    ref_type: refType,
    ref_id: refId,
    created_at: at || now(),
  });
  return { id, status };
}

/** Has a message with this template/ref already been sent? (idempotent automations) */
export async function alreadySent(template, refType, refId) {
  return Boolean(
    await one('SELECT id FROM message_log WHERE template = ? AND ref_type = ? AND ref_id = ? LIMIT 1', [
      template,
      refType,
      refId,
    ]),
  );
}

/** In-app notification for a platform user. */
export async function notifyUser(userId, title, body = '', link = null) {
  if (!userId) return;
  await insert('notifications', { user_id: userId, title, body, link, created_at: now() });
}

/** Notify the salon owner and managers. */
export async function notifySalonAdmins(salonId, title, body = '', link = null) {
  const rows = await q(
    `SELECT owner_user_id AS uid FROM salons WHERE id = ?
     UNION SELECT user_id FROM salon_staff WHERE salon_id = ? AND role = 'manager' AND is_active = 1`,
    [salonId, salonId],
  );
  for (const r of rows) await notifyUser(r.uid, title, body, link);
}

/** Loss-prevention / compliance trail. */
export async function audit(salonId, userId, action, entity, entityId, details = null) {
  await insert('audit_log', {
    salon_id: salonId,
    user_id: userId,
    action,
    entity,
    entity_id: entityId,
    details: details ? JSON.stringify(details) : null,
    created_at: now(),
  });
}
