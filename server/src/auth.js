import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "./env.js";
import { prisma } from "./db.js";

export const hashPassword = (plain) => bcrypt.hash(plain, 12);

export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

export const signToken = (user) =>
  jwt.sign({ sub: user.id, tenantId: user.tenantId, role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });

/// Préhandler Fastify : exige un Bearer token valide et attache
/// request.user + request.tenantId, sur lesquels toutes les requêtes
/// de données doivent être filtrées.
export const authenticate = async (request, reply) => {
  const header = request.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return reply.code(401).send({ error: "Authentification requise" });
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    return reply.code(401).send({ error: "Jeton invalide ou expiré" });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { tenant: true },
  });

  if (!user) {
    return reply.code(401).send({ error: "Compte introuvable" });
  }

  request.user = user;
  request.tenantId = user.tenantId;
};
