import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs/promises';
import { uploadlogbookUser } from '../lib/multer.js';

test('logbook accepts a PDF below 4 MB and rejects above 4 MB with a clear message', async () => {
  const app = express();
  app.post('/', uploadlogbookUser.any(), async (req, res) => {
    for (const file of req.files || []) await fs.unlink(file.path);
    res.json({ ok: true });
  });
  app.use((error, req, res, next) => res.status(400).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    for (const [size, expected] of [[4 * 1024 * 1024 - 1, 200], [4 * 1024 * 1024 + 1, 413]]) {
      const bytes = Buffer.alloc(size, 32);
      bytes.write('%PDF-1.4\n');
      const body = new FormData();
      body.append('file', new Blob([bytes], { type: 'application/pdf' }), 'limit-test.pdf');
      const response = await fetch(`http://127.0.0.1:${server.address().port}/`, { method: 'POST', body });
      assert.equal(response.status, expected);
      const result = await response.json();
      if (expected === 413) assert.match(result.message, /Maximum file size is 4 MB/);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});
