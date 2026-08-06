import { z } from "zod";
import { prisma, serialize } from "../db.js";
import { authenticate } from "../auth.js";

/// CRUD générique des modules métier. Un module range ses données dans
/// des collections nommées : /api/records/crm/clients, etc.
/// L'isolation par tenant est le seul vrai contrat de ce fichier.

const nameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/, "minuscules, chiffres et tirets uniquement");

const MAX_DATA_BYTES = 64 * 1024;

const validateParams = (params, reply) => {
  const module = nameSchema.safeParse(params.module);
  const collection = nameSchema.safeParse(params.collection);
  if (!module.success || !collection.success) {
    reply.code(400).send({ error: "Nom de module ou de collection invalide" });
    return null;
  }
  return { module: module.data, collection: collection.data };
};

const validateData = (body, reply) => {
  const data = body?.data;
  if (data == null || typeof data !== "object" || Array.isArray(data)) {
    reply.code(400).send({ error: "`data` doit être un objet JSON" });
    return null;
  }
  if (JSON.stringify(data).length > MAX_DATA_BYTES) {
    reply.code(413).send({ error: "Enregistrement trop volumineux (64 Ko max)" });
    return null;
  }
  return data;
};

export default async function recordRoutes(app) {
  app.addHook("preHandler", authenticate);

  app.get("/:module/:collection", async (request, reply) => {
    const names = validateParams(request.params, reply);
    if (!names) return;

    const records = await prisma.record.findMany({
      where: { tenantId: request.tenantId, ...names },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    return serialize(records);
  });

  app.post("/:module/:collection", async (request, reply) => {
    const names = validateParams(request.params, reply);
    if (!names) return;
    const data = validateData(request.body, reply);
    if (!data) return;

    const record = await prisma.record.create({
      data: {
        tenantId: request.tenantId,
        userId: request.user.id,
        ...names,
        data,
      },
    });

    return reply.code(201).send(serialize(record));
  });

  app.put("/:module/:collection/:id", async (request, reply) => {
    const names = validateParams(request.params, reply);
    if (!names) return;
    const data = validateData(request.body, reply);
    if (!data) return;

    // updateMany + filtre tenant : impossible de toucher la ligne d'un autre client.
    const { count } = await prisma.record.updateMany({
      where: { id: request.params.id, tenantId: request.tenantId, ...names },
      data: { data },
    });

    if (count === 0) {
      return reply.code(404).send({ error: "Enregistrement introuvable" });
    }

    const record = await prisma.record.findUnique({ where: { id: request.params.id } });
    return serialize(record);
  });

  app.delete("/:module/:collection/:id", async (request, reply) => {
    const names = validateParams(request.params, reply);
    if (!names) return;

    const { count } = await prisma.record.deleteMany({
      where: { id: request.params.id, tenantId: request.tenantId, ...names },
    });

    if (count === 0) {
      return reply.code(404).send({ error: "Enregistrement introuvable" });
    }

    return reply.code(204).send();
  });
}
