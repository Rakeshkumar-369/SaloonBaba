import { config, integrationsStatus } from './config.js';
import { createApp } from './app.js';
import { startScheduler, checkDb } from './services/automations.js';

const app = createApp();

try {
  await checkDb();
} catch (e) {
  console.error(`\n  Cannot connect to MySQL at ${config.db.host}:${config.db.port} (${e.message}).`);
  console.error('  Check DB_* values in .env and run "npm run db:reset" once.\n');
  process.exit(1);
}

app.listen(config.port, () => {
  const i = integrationsStatus();
  console.log(`\n  SaloonBaba API on http://localhost:${config.port}`);
  console.log(`  Integrations → WhatsApp: ${i.whatsapp}, SMS: ${i.sms}, Payments: ${i.payments}\n`);
  startScheduler();
});
