import "dotenv/config";
import { defineConfig, env } from "prisma/config";

const databaseUrl = new URL(env("DATABASE_URL"));
if (process.env.NODE_ENV !== 'production' && process.env.DEV_DATABASE_SOCKET_PATH) {
  databaseUrl.username = process.env.DEV_DATABASE_USER || databaseUrl.username;
  if (process.env.DEV_DATABASE_NAME) databaseUrl.pathname = `/${process.env.DEV_DATABASE_NAME}`;
  databaseUrl.searchParams.set('socket', process.env.DEV_DATABASE_SOCKET_PATH);
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl.toString(),
  },
});
