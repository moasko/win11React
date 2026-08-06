import { z } from "zod";
import { prisma, serialize } from "../db.js";
import { env } from "../env.js";
import { authenticate, hashPassword, signToken, verifyPassword } from "../auth.js";

const registerSchema = z.object({
  company: z.string().min(2),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const slugify = (value) =>
  value
    // NFD sépare les accents en diacritiques, que l'on retire ensuite.
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export default async function authRoutes(app) {
  /// Inscription : crée l'espace de travail, son propriétaire, son quota
  /// et sa racine de fichiers — le tout en une transaction, pour ne jamais
  /// laisser un tenant à moitié construit.
  app.post("/register", async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }
    const { company, name, email, password } = parsed.data;

    if (await prisma.user.findUnique({ where: { email } })) {
      return reply.code(409).send({ error: "Cette adresse e-mail est déjà utilisée" });
    }

    let slug = slugify(company);
    if (await prisma.tenant.findUnique({ where: { slug } })) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 7)}`;
    }

    const passwordHash = await hashPassword(password);

    const { user, tenant } = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: company, slug, quota: env.defaultTenantQuota },
      });

      const user = await tx.user.create({
        data: { tenantId: tenant.id, email, name, passwordHash, role: "OWNER" },
      });

      // Dossiers de départ de l'espace utilisateur.
      await tx.fsNode.createMany({
        data: ["Documents", "Images", "Partagé"].map((folder) => ({
          tenantId: tenant.id,
          ownerId: user.id,
          parentId: null,
          name: folder,
          type: "FOLDER",
        })),
      });

      // Les apps du socle sont installées d'office.
      const coreApps = await tx.app.findMany({ where: { isCore: true } });
      if (coreApps.length) {
        await tx.installation.createMany({
          data: coreApps.map((a) => ({
            tenantId: tenant.id,
            userId: user.id,
            appId: a.id,
          })),
        });
      }

      return { user, tenant };
    });

    return reply.code(201).send(
      serialize({
        token: signToken(user),
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, quota: tenant.quota },
      }),
    );
  });

  app.post("/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Données invalides" });
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email }, include: { tenant: true } });
    // Message identique dans les deux cas : ne pas révéler quels e-mails existent.
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return reply.code(401).send({ error: "Identifiants incorrects" });
    }

    return serialize({
      token: signToken(user),
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        slug: user.tenant.slug,
        quota: user.tenant.quota,
        usedBytes: user.tenant.usedBytes,
      },
    });
  });

  app.get("/me", { preHandler: authenticate }, async (request) =>
    serialize({
      user: {
        id: request.user.id,
        name: request.user.name,
        email: request.user.email,
        role: request.user.role,
      },
      tenant: {
        id: request.user.tenant.id,
        name: request.user.tenant.name,
        slug: request.user.tenant.slug,
        plan: request.user.tenant.plan,
        quota: request.user.tenant.quota,
        usedBytes: request.user.tenant.usedBytes,
      },
    }),
  );
}
