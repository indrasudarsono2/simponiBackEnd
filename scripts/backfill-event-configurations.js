import prisma from '../lib/prisma.js';
import { captureConfiguration, readLiveConfiguration, configurationIssues } from '../services/eventConfiguration.js';

const apply = process.argv.includes('--apply');
try {
  const events = await prisma.event.findMany({ where: { deletedAt: null, configurationVersions: { none: {} } }, select: { id: true, event: true }, orderBy: { id: 'asc' } });
  console.log(`${apply ? 'Apply' : 'Preview'}: ${events.length} events without a saved configuration.`);
  for (const event of events) {
    const snapshot = await readLiveConfiguration(prisma, event.id);
    const issues = configurationIssues(snapshot);
    if (apply) await captureConfiguration({ eventId: event.id, source: 'BACKFILL_CURRENT', reason: 'Captured from current settings during rollout. Original historical composition is unknown; earlier attempts are not attributed to this version.' });
    console.log(JSON.stringify({ eventId: event.id, event: event.event, source: 'BACKFILL_CURRENT', issues, saved: apply }));
  }
} finally { await prisma.$disconnect(); }
