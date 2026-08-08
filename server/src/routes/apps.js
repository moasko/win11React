import { z } from "zod";
import { prisma, serialize } from "../db.js";
import { authenticate, exigerRole } from "../auth.js";
import { journaliser } from "../audit.js";

// Deux origines d'applications cohabitent :
//   - le catalogue global (tenantId null), offert à tous les espaces ;
//   - les applications créées dans le Studio, propres à un espace.
// Toute recherche par slug doit donc regarder les deux, jamais l'une sans
// l'autre, et jamais celles d'un autre client.

const visibleTo = (tenantId, extra = {}) => ({
  ...extra,
  OR: [{ tenantId: null }, { tenantId }],
});

const findVisibleApp = (tenantId, slug) =>
  prisma.app.findFirst({ where: visibleTo(tenantId, { slug }) });

const slugSchema = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9-]+$/, "minuscules, chiffres et tirets uniquement");

// Les types de champ d'une application du Studio.
//
// La liste doit rester alignée sur `TYPES` dans
// src/apps/modules/studio/domaine.js — c'est le seul couplage entre les
// deux, et il est volontaire : le serveur ne fait confiance à rien de ce
// que le client lui envoie, y compris à un type de champ.
const champSchema = z.object({
  key: z.string().min(1).max(40),
  label: z.string().min(1).max(80),
  type: z.enum([
    "texte",
    "zone",
    "nombre",
    "date",
    "choix",
    "booleen",
    "montant",
    "telephone",
    "email",
    "lien",
    "relation",
    "calcul",
  ]),
  options: z.array(z.string()).optional(),
  required: z.boolean().optional(),
  /// Collection visée par une relation.
  cible: z.string().max(40).optional(),
  /// Mise en page de la fiche : demi-largeur ou pleine largeur, et section
  /// nommée — des réglages d'affichage, sans effet sur les données.
  largeur: z.enum(["demi", "plein"]).optional(),
  section: z.string().max(60).optional(),
  /// Formule d'un champ calculé. Elle n'est jamais exécutée ici : le
  /// serveur ne fait que la stocker, c'est le client qui l'évalue avec son
  /// propre analyseur — voir `evaluer` dans le domaine du Studio.
  formule: z.string().max(200).optional(),
});

const collectionSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9-]+$/),
  label: z.string().min(1).max(80),
  icon: z.string().max(60).optional(),
  fields: z.array(champSchema).max(24),
  /// Comment la collection s'affiche : tableau, cartes, ou kanban groupé
  /// par un champ à choix.
  vue: z
    .object({
      mode: z.enum(["liste", "cartes", "kanban"]),
      groupePar: z.string().max(40).optional(),
      carte: z.array(z.string()).max(6).optional(),
    })
    .optional(),
});

/// Un pavé du tableau de bord d'une application.
const widgetSchema = z.object({
  type: z.enum(["compteur", "somme", "repartition"]),
  titre: z.string().max(60).optional(),
  collection: z.string().max(40),
  champ: z.string().max(40).optional(),
  filtre: z
    .object({ champ: z.string().max(40), valeur: z.string().max(80) })
    .optional(),
});

const definitionSchema = z.object({
  collections: z.array(collectionSchema).min(1).max(8),
  /// Le tableau de bord de l'application — jusqu'à huit pavés.
  accueil: z.array(widgetSchema).max(8).optional(),
});

const appSchema = z.object({
  slug: slugSchema,
  name: z.string().min(2).max(60),
  description: z.string().max(240).default(""),
  icon: z.string().min(1).max(60),
  category: z.string().min(1).max(40).default("Sur mesure"),
  definition: definitionSchema,
  published: z.boolean().optional(),
});

export default async function appRoutes(app) {
  app.addHook("preHandler", authenticate);

  /// Catalogue de la Boutique, avec l'état d'installation pour cet espace
  /// de travail — le front n'a qu'un appel à faire pour rendre la page.
  /// Les brouillons du Studio (published = false) n'y figurent pas.
  app.get("/catalog", async (request) => {
    const [apps, installations] = await Promise.all([
      prisma.app.findMany({
        where: visibleTo(request.tenantId, { published: true }),
        orderBy: [{ category: "asc" }, { name: "asc" }],
      }),
      prisma.installation.findMany({ where: { tenantId: request.tenantId } }),
    ]);

    const versionInstallee = new Map(installations.map((i) => [i.appId, i.version]));

    return serialize(
      apps.map((a) => ({
        ...a,
        installed: versionInstallee.has(a.id),
        installedVersion: versionInstallee.get(a.id) ?? null,
      })),
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
        // Ce qui est en place, à distinguer de `version` qui est ce que le
        // catalogue propose. C'est l'écart entre les deux qui fait une
        // mise à jour.
        installedVersion: i.version,
      })),
    );
  });

  // --- Applications créées dans le Studio ---------------------------------

  /// Les applications de cet espace, publiées ou non.
  app.get("/mine", async (request) => {
    const apps = await prisma.app.findMany({
      where: { tenantId: request.tenantId },
      orderBy: { publishedAt: "desc" },
    });
    return serialize(apps);
  });

  app.post("/", async (request, reply) => {
    const parsed = appSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Définition invalide", details: parsed.error.flatten() });
    }

    // Un slug du catalogue global est réservé : laisser un espace le
    // réutiliser rendrait l'application d'origine inatteignable.
    const conflict = await findVisibleApp(request.tenantId, parsed.data.slug);
    if (conflict) {
      return reply
        .code(409)
        .send({ error: `L'identifiant « ${parsed.data.slug} » est déjà utilisé` });
    }

    const created = await prisma.app.create({
      data: {
        ...parsed.data,
        tenantId: request.tenantId,
        kind: "CUSTOM",
        published: parsed.data.published ?? false,
      },
    });

    await journaliser(request, "studio.creation", created.name, { slug: created.slug });

    return reply.code(201).send(serialize(created));
  });

  app.put("/:slug", async (request, reply) => {
    const parsed = appSchema.partial({ slug: true }).safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Définition invalide", details: parsed.error.flatten() });
    }

    // deleteMany/updateMany filtrés sur le tenant : impossible de toucher
    // l'application d'un autre client, ni une app du catalogue global.
    const { count } = await prisma.app.updateMany({
      where: { tenantId: request.tenantId, slug: request.params.slug },
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        icon: parsed.data.icon,
        category: parsed.data.category,
        definition: parsed.data.definition,
        ...(parsed.data.published === undefined
          ? {}
          : { published: parsed.data.published }),
      },
    });

    if (count === 0) {
      return reply.code(404).send({ error: "Application introuvable" });
    }

    const updated = await prisma.app.findFirst({
      where: { tenantId: request.tenantId, slug: request.params.slug },
    });

    await journaliser(request, "studio.modification", updated.name, {
      slug: updated.slug,
      publiee: updated.published,
    });

    return serialize(updated);
  });

  app.delete("/:slug", async (request, reply) => {
    const target = await prisma.app.findFirst({
      where: { tenantId: request.tenantId, slug: request.params.slug },
    });
    if (!target) {
      return reply.code(404).send({ error: "Application introuvable" });
    }

    // Les installations partent avec l'application ; les enregistrements
    // saisis restent, pour qu'une suppression par erreur ne perde rien.
    await prisma.app.delete({ where: { id: target.id } });

    await journaliser(request, "studio.suppression", target.name, { slug: target.slug });

    return reply.code(204).send();
  });

  // --- Installation --------------------------------------------------------

  // Installer ou retirer une application engage tout l'espace de travail,
  // pas seulement celui qui clique : réservé aux administrateurs.
  app.post("/:slug/install", { preHandler: exigerRole("ADMIN") }, async (request, reply) => {
    const target = await findVisibleApp(request.tenantId, request.params.slug);
    if (!target) {
      return reply.code(404).send({ error: "Application introuvable" });
    }

    // La version est celle que le shell dit installer. C'est lui qui porte
    // le code, donc lui seul sait ce qu'il vient de mettre en place ; le
    // serveur, qui ne fait que l'enregistrer, retombe sur celle du
    // catalogue quand rien ne lui est transmis.
    const version = String(request.body?.version || target.version || "").slice(0, 20);

    const installation = await prisma.installation.upsert({
      where: { tenantId_appId: { tenantId: request.tenantId, appId: target.id } },
      update: { version },
      create: {
        tenantId: request.tenantId,
        userId: request.user.id,
        appId: target.id,
        version,
      },
      include: { app: true },
    });

    await journaliser(request, "app.installation", target.name, {
      slug: target.slug,
      version,
    });

    return reply
      .code(201)
      .send(serialize({ ...installation.app, installed: true, installedVersion: version }));
  });

  /// Enregistre une mise à jour appliquée.
  ///
  /// Route distincte de l'installation, pour deux raisons : le journal doit
  /// distinguer « a installé » de « a mis à jour », et une mise à jour n'a
  /// de sens que sur une application déjà en place — l'exiger évite qu'un
  /// appel de travers installe silencieusement autre chose.
  app.put("/:slug/install", { preHandler: exigerRole("ADMIN") }, async (request, reply) => {
    const target = await findVisibleApp(request.tenantId, request.params.slug);
    if (!target) {
      return reply.code(404).send({ error: "Application introuvable" });
    }

    const existante = await prisma.installation.findFirst({
      where: { tenantId: request.tenantId, appId: target.id },
    });
    if (!existante) {
      return reply.code(409).send({ error: "Cette application n'est pas installée." });
    }

    const version = String(request.body?.version || target.version || "").slice(0, 20);
    const avant = existante.version || null;

    const installation = await prisma.installation.update({
      where: { id: existante.id },
      data: { version },
      include: { app: true },
    });

    // Pas de trace quand il n'y a pas d'« avant » : ce n'est pas une mise à
    // jour, c'est l'enregistrement d'une version de référence pour une
    // installation antérieure au suivi. Treize lignes de bookkeeping
    // noieraient les vrais événements du journal.
    if (avant) {
      await journaliser(request, "app.miseajour", target.name, {
        slug: target.slug,
        avant,
        apres: version,
      });
    }

    return reply.send(
      serialize({ ...installation.app, installed: true, installedVersion: version }),
    );
  });

  app.delete("/:slug/install", { preHandler: exigerRole("ADMIN") }, async (request, reply) => {
    const target = await findVisibleApp(request.tenantId, request.params.slug);
    if (!target) {
      return reply.code(404).send({ error: "Application introuvable" });
    }
    if (target.isCore) {
      return reply
        .code(409)
        .send({ error: "Une application du socle ne peut pas être désinstallée" });
    }

    await prisma.installation.deleteMany({
      where: { tenantId: request.tenantId, appId: target.id },
    });

    await journaliser(request, "app.desinstallation", target.name, { slug: target.slug });

    return reply.code(204).send();
  });
}
