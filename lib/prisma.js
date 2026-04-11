import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

// Parse DATABASE_URL into a config object to avoid mariadb driver
// issues with empty passwords in connection string format.
const dbUrl = new URL(process.env.DATABASE_URL);
const adapter = new PrismaMariaDb({
  host: dbUrl.hostname,
  port: parseInt(dbUrl.port) || 3306,
  user: dbUrl.username,
  password: dbUrl.password || undefined,
  database: dbUrl.pathname.slice(1),
});

const prisma = new PrismaClient({ adapter });

export default prisma;
