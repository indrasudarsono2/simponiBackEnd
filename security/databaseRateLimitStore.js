import crypto from 'node:crypto';
import prisma from '../lib/prisma.js';

// One database-backed counter per policy/key, shared by every backend worker.
// Keys are hashed so the table does not contain raw employee IDs or IP addresses.
export class DatabaseRateLimitStore {
  localKeys = false;
  constructor(prefix, db = prisma) {
    this.prefix = prefix;
    this.db = db;
  }
  init(options) { this.windowMs = options.windowMs; }
  id(key) { return crypto.createHash('sha256').update(`${this.prefix}:${key}`).digest('hex'); }
  async increment(key) {
    const id = this.id(key);
    const now = new Date();
    const reset = new Date(now.getTime() + this.windowMs);
    return this.db.$transaction(async tx => {
      await tx.$executeRaw`
        INSERT INTO ApiRateLimitBucket (id, totalHits, resetAt) VALUES (${id}, 1, ${reset})
        ON DUPLICATE KEY UPDATE
          totalHits = IF(resetAt <= ${now}, 1, LEAST(totalHits + 1, 2147483647)),
          resetAt = IF(resetAt <= ${now}, ${reset}, resetAt)`;
      const rows = await tx.$queryRaw`SELECT totalHits, resetAt FROM ApiRateLimitBucket WHERE id = ${id}`;
      if (rows.length !== 1) throw new Error('Rate-limit counter unavailable');
      return { totalHits: Number(rows[0].totalHits), resetTime: new Date(rows[0].resetAt) };
    });
  }
  async decrement(key) {
    const id = this.id(key);
    await this.db.$executeRaw`UPDATE ApiRateLimitBucket SET totalHits = GREATEST(totalHits - 1, 0)
      WHERE id = ${id} AND resetAt > ${new Date()}`;
  }
  async resetKey(key) {
    await this.db.$executeRaw`DELETE FROM ApiRateLimitBucket WHERE id = ${this.id(key)}`;
  }
}

export const sharedRateLimitStore = prefix => new DatabaseRateLimitStore(prefix);
