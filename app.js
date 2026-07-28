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
import './config/security.js';
import { serveSignedFile } from './middleware/privateFiles.js';
import { startEscalationScheduler } from './workers/escalationScheduler.js';

// 2. Initializations
const app = express();
const PORT = process.env.PORT || 3001;

// 3. Middleware
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
const allowedOrigins = (process.env.CORS_ORIGIN || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000'))
  .split(',').map((item) => item.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.get('/files/:expires/:signature/{*filePath}', serveSignedFile(join(dirname(fileURLToPath(import.meta.url)), 'uploads')));
app.use('/uploads', (_req, res) => res.status(404).json({ message: 'Not found.' }));

// 4. Routes
app.get('/', (req, res) => {
  res.send('Hello World');
});

app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false }));

app.use('/api', apiRouter);

// 5. Error Handling Middleware (Optional but recommended)
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  // Handle multer errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File too large. Max size is 5MB.' });
    }
    return res.status(400).json({ message: err.message });
  }
  
  res.status(500).json({ message: 'Something broke!' });
});

// 6. Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server is humming along on http://localhost:${PORT}`);
  startEscalationScheduler();
});
