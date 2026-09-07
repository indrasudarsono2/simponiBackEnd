// 1. Imports (Grouped at the top)
import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import cors from 'cors';
import apiRouter from './router/api.js';
import securityConfig from './config/security.js';
import prisma from './lib/prisma.js';
import { serveSignedFile } from './middleware/privateFiles.js';
import { startEscalationScheduler } from './workers/escalationScheduler.js';
import { requireHttps, shouldEnforceHttpsRedirect } from './middleware/requireHttps.js';

// 2. Initializations
const app = express();
const PORT = process.env.PORT || 44441;
const isProduction = process.env.NODE_ENV === 'production';
const publicBaseUrl = process.env.SIMPONI_PUBLIC_BASE_URL?.trim();
const enforceHttpsRedirect = shouldEnforceHttpsRedirect(
  isProduction,
  process.env.ENFORCE_HTTPS_REDIRECT?.trim().toLowerCase(),
);

// Only configured proxy peers may influence protocol and client IP detection.
// Add verified gateway addresses here only when they connect directly to Express.
app.set('trust proxy', (process.env.TRUSTED_PROXY_CIDRS || 'loopback')
  .split(',').map(value => value.trim()).filter(Boolean));

// 3. Middleware
app.disable('x-powered-by');
// Helmet with HSTS enabled only in production (Strict-Transport-Security)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-site' },
  hsts: isProduction
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
}));
const allowedOrigins = (process.env.CORS_ORIGIN || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:44440'))
  .split(',').map((item) => item.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Prevent controllers from leaking database and infrastructure errors. This
// also protects legacy handlers that still build their own 5xx responses.
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (isProduction && res.statusCode >= 500) {
      console.error('Internal request failure', {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        internalMessage: body?.message,
        internalError: body?.error,
      });

      return originalJson({
        success: false,
        message: 'An unexpected error occurred.',
        ...(body?.error?.code && { error: { code: body.error.code } }),
      });
    }
    return originalJson(body);
  };
  next();
});

// Issue #3: Redirect HTTP → HTTPS in production (when behind a reverse proxy)
app.get('/health/live', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'ready' });
  } catch (error) {
    console.error('Readiness check failed:', error);
    res.status(503).json({ status: 'not_ready' });
  }
});

if (isProduction) {
  if (!publicBaseUrl || new URL(publicBaseUrl).protocol !== 'https:') {
    throw new Error('SIMPONI_PUBLIC_BASE_URL must be configured with an HTTPS URL in production.');
  }

  if (enforceHttpsRedirect) {
    app.use(requireHttps(publicBaseUrl));
  }
}

app.get('/files/:expires/:signature/{*filePath}', serveSignedFile(join(dirname(fileURLToPath(import.meta.url)), 'uploads')));
app.use('/uploads', (_req, res) => res.status(404).json({ message: 'Not found.' }));

// 4. Routes
app.get('/', (req, res) => {
  res.send('Hello World');
});

// Issue #5: General rate limiter for ALL API routes (prevents enumeration / DoS)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api', apiLimiter);

// Stricter rate limiter for login endpoint (brute-force / credential stuffing)
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false }));
app.use('/api/auth/forgot-password', rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false }));
app.use('/api/auth/reset-password', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false }));

app.use('/api', apiRouter);

// 5. Error Handling Middleware (Optional but recommended)
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  // Issue #4: Handle multer errors with safe, user-facing messages (no internal leakage)
  if (err instanceof multer.MulterError) {
    const safeMulterMessages = {
      LIMIT_FILE_SIZE: 'File too large. Max size is 5MB.',
      LIMIT_UNEXPECTED_FILE: 'Unexpected file field in upload.',
      LIMIT_FILE_COUNT: 'Too many files uploaded.',
      LIMIT_FIELD_KEY: 'Field name too long.',
      LIMIT_FIELD_VALUE: 'Field value too long.',
      LIMIT_FIELD_COUNT: 'Too many form fields.',
      INVALID_FILE_CONTENT: 'Uploaded file content does not match an allowed file type.',
    };
    return res.status(400).json({
      message: safeMulterMessages[err.code] || 'File upload error.',
    });
  }
  
  res.status(500).json({ message: 'Something broke!' });
});

// 6. Start Server
let escalationScheduler;
const server = app.listen(PORT, securityConfig.serverHost, () => {
  console.log(`🚀 Server is listening on ${securityConfig.serverHost}:${PORT}`);
  if (process.env.RUN_ESCALATION_SCHEDULER !== 'false') {
    escalationScheduler = startEscalationScheduler();
  }
});

let isShuttingDown = false;
const shutdown = (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`${signal} received; shutting down gracefully.`);
  escalationScheduler?.stop();

  const forceExitTimer = setTimeout(() => {
    console.error('Graceful shutdown timed out; forcing exit.');
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  server.close(async (error) => {
    try {
      await prisma.$disconnect();
    } finally {
      if (error) console.error('HTTP server shutdown failed:', error);
      process.exit(error ? 1 : 0);
    }
  });
};

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
