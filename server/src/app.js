import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config.js';
import { authenticate } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import customerRoutes from './routes/customer.js';
import salonRoutes from './routes/salon/index.js';
import staffAppRoutes from './routes/staffApp.js';
import franchiseRoutes from './routes/franchise.js';
import vendorRoutes from './routes/vendor.js';
import adminRoutes from './routes/admin.js';
import integrationRoutes from './routes/integrations.js';
import meRoutes from './routes/me.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://checkout.razorpay.com'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org'],
          connectSrc: ["'self'", 'https://api.razorpay.com', 'https://lumberjack.razorpay.com'],
          frameSrc: ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com', 'https://www.openstreetmap.org'],
          mediaSrc: ["'self'", 'blob:'],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());
  app.use(cors({ origin: config.isProd ? config.appUrl : true }));
  // Keep raw body for webhook signature checks
  app.use(express.json({ limit: '2mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
  app.use(express.urlencoded({ extended: false }));

  fs.mkdirSync(config.uploadDir, { recursive: true });
  app.use('/uploads', express.static(config.uploadDir, { maxAge: '7d' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  app.use('/api/auth', authRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/integrations', integrationRoutes);
  app.use('/api/customer', customerRoutes);
  app.use('/api/me', authenticate, meRoutes);
  app.use('/api/salons', authenticate, salonRoutes);
  app.use('/api/staff-app', authenticate, staffAppRoutes);
  app.use('/api/franchise', authenticate, franchiseRoutes);
  app.use('/api/vendor', authenticate, vendorRoutes);
  app.use('/api/admin', authenticate, adminRoutes);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // Serve the built React app (single deployable)
  if (fs.existsSync(config.clientDist)) {
    app.use(
      express.static(config.clientDist, {
        index: false,
        setHeaders: (res, file) => {
          if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      }),
    );
    app.get(/^\/(?!api|uploads).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(config.clientDist, 'index.html'));
    });
  }

  // Errors
  app.use((err, req, res, _next) => {
    const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
    if (status >= 500) console.error(`[${req.method} ${req.originalUrl}]`, err);
    let message = status >= 500 ? 'Something went wrong. Please try again.' : err.message;
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This already exists' });
    res.status(status).json({ error: message, ...(err.extra || {}) });
  });
  return app;
}
