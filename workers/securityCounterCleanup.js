import prisma from '../lib/prisma.js';

export function startSecurityCounterCleanup() {
  const timer = setInterval(async () => {
    try {
      // Only expired security counters, never users, results, or active buckets.
      await prisma.$executeRaw`DELETE FROM ApiRateLimitBucket
        WHERE resetAt < ${new Date(Date.now() - 24 * 60 * 60 * 1000)} LIMIT 10000`;
    } catch (error) { console.error('Security counter cleanup failed:', error.code || error.name); }
  }, 15 * 60 * 1000);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}
