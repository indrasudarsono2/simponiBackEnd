import prisma from '../lib/prisma.js';
import { roomRecoveryWhere, assignDefaultRoom } from '../services/defaultModeOneRoom.js';

try {
  const participants = await prisma.eventUser.findMany({ where: roomRecoveryWhere(null), select: { id: true }, orderBy: { id: 'asc' } });
  console.log(`Eligible missing assignments: ${participants.length}. ${process.argv.includes('--apply') ? 'Applying' : 'Preview only; use --apply'}.`);
  if (process.argv.includes('--apply')) {
    for (const { id } of participants) console.log(JSON.stringify({ id, ...await assignDefaultRoom(id) }));
  }
} finally { await prisma.$disconnect(); }
