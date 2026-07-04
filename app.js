// 1. Imports (Grouped at the top)
import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import cors from 'cors';
import apiRouter from './router/api.js';

// 2. Initializations
const app = express();
const PORT = process.env.PORT || 3001;

// 3. Middleware
app.use(cors());
app.use(express.json()); // Essential if you plan to send/receive JSON
app.use(express.urlencoded({ extended: true }));

// Serve static files from uploads directory
app.use('/uploads', express.static('uploads'));

// 4. Routes
app.get('/', (req, res) => {
  res.send('Hello World');
});

// Temporary public debug endpoint: returns captured duty report JSON
app.get('/api/debug/dutyReports', (req, res) => {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const raw = readFileSync(join(__dirname, 'tes-output1.json'), 'utf8');
    const data = JSON.parse(raw);
    res.json({ debug: true, source: 'tes-output1.json', data });
  } catch (err) {
    res.status(500).json({ debug: false, error: err.message });
  }
});

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
  
  res.status(500).json({ message: 'Something broke!', error: err.message });
});

// 6. Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server is humming along on http://localhost:${PORT}`);
});
