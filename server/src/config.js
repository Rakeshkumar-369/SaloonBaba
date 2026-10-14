import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '../..');
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });

// All salon times are local Indian time; keep Node in the same zone.
process.env.TZ = process.env.TZ || 'Asia/Kolkata';

const env = process.env;

export const config = {
  port: Number(env.PORT || 4000),
  isProd: env.NODE_ENV === 'production',
  jwtSecret: env.JWT_SECRET || 'saloonbaba-dev-secret',
  appUrl: env.APP_URL || 'http://localhost:5173',
  uploadDir: path.join(ROOT, 'server', 'uploads'),
  clientDist: path.join(ROOT, 'client', 'dist'),
  db: {
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || 'saloonbaba',
    password: env.DB_PASSWORD || 'saloonbaba',
    database: env.DB_NAME || 'saloonbaba',
  },
  whatsapp: {
    token: env.WHATSAPP_TOKEN || '',
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || '',
    verifyToken: env.WHATSAPP_VERIFY_TOKEN || 'saloonbaba-verify',
  },
  msg91: {
    authKey: env.MSG91_AUTH_KEY || '',
    senderId: env.MSG91_SENDER_ID || 'SALBAB',
    templateId: env.MSG91_TEMPLATE_ID || '',
  },
  razorpay: {
    keyId: env.RAZORPAY_KEY_ID || '',
    keySecret: env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET || '',
  },
  scheduler: {
    enabled: (env.SCHEDULER_ENABLED || 'true') !== 'false',
    intervalMin: Number(env.SCHEDULER_INTERVAL_MIN || 15),
  },
};

export const integrationsStatus = () => ({
  whatsapp: config.whatsapp.token && config.whatsapp.phoneNumberId ? 'live' : 'simulated',
  sms: config.msg91.authKey ? 'live' : 'simulated',
  payments: config.razorpay.keyId && config.razorpay.keySecret ? 'live' : 'simulated',
});
