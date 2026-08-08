# API CompanyOS — Fastify + Prisma.
#
# L'image embarque le client Prisma généré et applique les migrations au
# démarrage : un déploiement Dokploy n'a aucune étape manuelle. Le seed est
# idempotent (il complète le catalogue d'applications sans rien écraser),
# on le rejoue donc à chaque démarrage sans risque.

FROM node:22-alpine

WORKDIR /app

# OpenSSL : requis par le moteur Prisma sur Alpine.
RUN apk add --no-cache openssl

# Dépendances complètes, dev comprises : le CLI `prisma` est une
# devDependency, mais `migrate deploy` en a besoin à chaque démarrage du
# conteneur. L'image est un peu plus lourde ; le démarrage, lui, ne
# télécharge jamais rien.
COPY package.json package-lock.json* ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src

# Le stockage des fichiers vit hors de l'image — voir le volume dans
# docker-compose.prod.yml. Sans volume, chaque redéploiement viderait le
# cloud des espaces de travail.
ENV STORAGE_LOCAL_PATH=/data/storage
ENV PORT=4000

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1

CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/seed.js && node src/index.js"]
