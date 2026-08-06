import { z } from "zod";
import { prisma, serialize } from "../db.js";
import { authenticate } from "../auth.js";
import { storage } from "../storage.js";

const folderSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().nullable().optional(),
});

/// Vérifie qu'un nœud appartient bien à l'espace de travail appelant.
/// Sans ce garde-fou, un id deviné donnerait accès aux fichiers d'un autre client.
const findOwned = (tenantId, id) =>
  prisma.fsNode.findFirst({ where: { id, tenantId } });

export default async function fileRoutes(app) {
  app.addHook("preHandler", authenticate);

  /// Consommation et quota de l'espace de travail.
  app.get("/usage", async (request) => {
    const tenant = await prisma.tenant.findUnique({ where: { id: request.tenantId } });
    return serialize({
      quota: tenant.quota,
      usedBytes: tenant.usedBytes,
      availableBytes: tenant.quota - tenant.usedBytes,
    });
  });

  /// Contenu d'un dossier. Sans parentId, on liste la racine.
  app.get("/", async (request) => {
    const parentId = request.query.parentId || null;

    const nodes = await prisma.fsNode.findMany({
      where: { tenantId: request.tenantId, parentId },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });

    return serialize(nodes);
  });

  app.post("/folder", async (request, reply) => {
    const parsed = folderSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Nom de dossier invalide" });
    }
    const { name, parentId = null } = parsed.data;

    if (parentId && !(await findOwned(request.tenantId, parentId))) {
      return reply.code(404).send({ error: "Dossier parent introuvable" });
    }

    try {
      const node = await prisma.fsNode.create({
        data: {
          tenantId: request.tenantId,
          ownerId: request.user.id,
          parentId,
          name,
          type: "FOLDER",
        },
      });
      return reply.code(201).send(serialize(node));
    } catch (err) {
      if (err.code === "P2002") {
        return reply.code(409).send({ error: "Un élément porte déjà ce nom ici" });
      }
      throw err;
    }
  });

  /// Envoi d'un fichier. Le quota est vérifié avant écriture, puis
  /// la consommation est incrémentée dans la même transaction que la
  /// création du nœud — sinon un envoi concurrent fausserait le compteur.
  app.post("/upload", async (request, reply) => {
    const upload = await request.file();
    if (!upload) {
      return reply.code(400).send({ error: "Aucun fichier reçu" });
    }

    const parentId = upload.fields?.parentId?.value || null;
    if (parentId && !(await findOwned(request.tenantId, parentId))) {
      return reply.code(404).send({ error: "Dossier parent introuvable" });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: request.tenantId } });
    if (tenant.usedBytes >= tenant.quota) {
      return reply.code(413).send({ error: "Quota de stockage atteint" });
    }

    const key = storage.buildKey(request.tenantId, upload.filename);
    const size = await storage.put(key, upload.file);

    // Le stream a pu dépasser le quota restant : on annule dans ce cas.
    if (tenant.usedBytes + BigInt(size) > tenant.quota) {
      await storage.remove(key);
      return reply.code(413).send({ error: "Quota de stockage dépassé" });
    }

    try {
      const node = await prisma.$transaction(async (tx) => {
        const created = await tx.fsNode.create({
          data: {
            tenantId: request.tenantId,
            ownerId: request.user.id,
            parentId,
            name: upload.filename,
            type: "FILE",
            size: BigInt(size),
            mimeType: upload.mimetype,
            storageKey: key,
          },
        });

        await tx.tenant.update({
          where: { id: request.tenantId },
          data: { usedBytes: { increment: BigInt(size) } },
        });

        return created;
      });

      return reply.code(201).send(serialize(node));
    } catch (err) {
      await storage.remove(key);
      if (err.code === "P2002") {
        return reply.code(409).send({ error: "Un fichier porte déjà ce nom ici" });
      }
      throw err;
    }
  });

  app.get("/:id/download", async (request, reply) => {
    const node = await findOwned(request.tenantId, request.params.id);
    if (!node || node.type !== "FILE") {
      return reply.code(404).send({ error: "Fichier introuvable" });
    }

    reply
      .header("Content-Type", node.mimeType || "application/octet-stream")
      .header("Content-Disposition", `attachment; filename="${encodeURIComponent(node.name)}"`);

    return reply.send(storage.read(node.storageKey));
  });

  /// Suppression récursive : on collecte l'arborescence, on libère le quota,
  /// puis on efface les octets. La cascade Prisma retire les enfants en base.
  app.delete("/:id", async (request, reply) => {
    const node = await findOwned(request.tenantId, request.params.id);
    if (!node) {
      return reply.code(404).send({ error: "Élément introuvable" });
    }

    const descendants = [];
    const collect = async (parentId) => {
      const children = await prisma.fsNode.findMany({
        where: { tenantId: request.tenantId, parentId },
      });
      for (const child of children) {
        descendants.push(child);
        if (child.type === "FOLDER") await collect(child.id);
      }
    };

    if (node.type === "FOLDER") await collect(node.id);
    const all = [node, ...descendants];
    const freed = all.reduce((sum, n) => sum + n.size, 0n);

    await prisma.$transaction(async (tx) => {
      await tx.fsNode.delete({ where: { id: node.id } });
      if (freed > 0n) {
        await tx.tenant.update({
          where: { id: request.tenantId },
          data: { usedBytes: { decrement: freed } },
        });
      }
    });

    for (const n of all) {
      if (n.storageKey) await storage.remove(n.storageKey);
    }

    return reply.code(204).send();
  });
}
