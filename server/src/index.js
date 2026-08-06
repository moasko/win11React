import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { env } from "./env.js";
import { prisma } from "./db.js";
import authRoutes from "./routes/auth.js";
import appRoutes from "./routes/apps.js";
import fileRoutes from "./routes/files.js";
import recordRoutes from "./routes/records.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: env.corsOrigin, credentials: true });
await app.register(multipart, {
  limits: { fileSize: 512 * 1024 * 1024 }, // 512 Mo par fichier
});

app.get("/health", async () => ({ status: "ok" }));

await app.register(authRoutes, { prefix: "/api/auth" });
await app.register(appRoutes, { prefix: "/api/apps" });
await app.register(fileRoutes, { prefix: "/api/files" });
await app.register(recordRoutes, { prefix: "/api/records" });

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
  await app.listen({ port: env.port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
