import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

// Parse DATABASE_URL into a config object to avoid mariadb driver
// issues with empty passwords in connection string format.
const dbUrl = new URL(process.env.DATABASE_URL);
// Optional development-only Unix socket authentication (for local macOS MariaDB).
const localSocket = process.env.NODE_ENV !== 'production' ? process.env.DEV_DATABASE_SOCKET_PATH : undefined;
const adapter = new PrismaMariaDb({
  ...(localSocket ? { socketPath: localSocket } : {}),
  host: dbUrl.hostname,
  port: parseInt(dbUrl.port) || 3306,
  user: localSocket ? (process.env.DEV_DATABASE_USER || dbUrl.username) : dbUrl.username,
  password: dbUrl.password || undefined,
  database: localSocket && process.env.DEV_DATABASE_NAME ? process.env.DEV_DATABASE_NAME : dbUrl.pathname.slice(1),
});

const prisma = new PrismaClient({ adapter });

export default prisma;
