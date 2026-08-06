import { prisma, serialize } from "../db.js";
import { authenticate } from "../auth.js";

export default async function appRoutes(app) {
  app.addHook("preHandler", authenticate);

  /// Catalogue de la Boutique, avec l'état d'installation pour cet espace
  /// de travail — le front n'a qu'un appel à faire pour rendre la page.
  app.get("/catalog", async (request) => {
    const [apps, installations] = await Promise.all([
      prisma.app.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] }),
      prisma.installation.findMany({ where: { tenantId: request.tenantId } }),
    ]);

    const installedIds = new Set(installations.map((i) => i.appId));

    return serialize(
      apps.map((a) => ({ ...a, installed: installedIds.has(a.id) })),
    );
  });

  /// Les apps réellement disponibles dans le shell de cet espace.
  app.get("/installed", async (request) => {
    const installations = await prisma.installation.findMany({
      where: { tenantId: request.tenantId },
      include: { app: true },
      orderBy: { installedAt: "asc" },
    });

    return serialize(
      installations.map((i) => ({
        ...i.app,
        settings: i.settings,
        installedAt: i.installedAt,
      })),
    );
  });

  app.post("/:slug/install", async (request, reply) => {
    const target = await prisma.app.findUnique({ where: { slug: request.params.slug } });
    if (!target) {
      return reply.code(404).send({ error: "Application introuvable" });
    }

    const installation = await prisma.installation.upsert({
      where: { tenantId_appId: { tenantId: request.tenantId, appId: target.id } },
      update: {},
      create: {
        tenantId: request.tenantId,
        userId: request.user.id,
        appId: target.id,
      },
      include: { app: true },
    });

    return reply.code(201).send(serialize({ ...installation.app, installed: true }));
  });

  app.delete("/:slug/install", async (request, reply) => {
    const target = await prisma.app.findUnique({ where: { slug: request.params.slug } });
    if (!target) {
      return reply.code(404).send({ error: "Application introuvable" });
    }
    if (target.isCore) {
      return reply.code(409).send({ error: "Une application du socle ne peut pas être désinstallée" });
    }

    await prisma.installation.deleteMany({
      where: { tenantId: request.tenantId, appId: target.id },
    });

    return reply.code(204).send();
  });
}
