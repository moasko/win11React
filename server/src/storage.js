import { createWriteStream, createReadStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import { env } from "./env.js";

/// Pilote disque local — suffisant en développement.
/// En production, remplacer par un pilote S3 exposant la même interface
/// (put / read / remove) : c'est le seul fichier à changer.
const localDriver = {
  buildKey(tenantId, filename) {
    return join(tenantId, `${randomUUID()}-${filename}`);
  },

  async put(key, stream) {
    const target = resolve(env.storageLocalPath, key);
    await mkdir(dirname(target), { recursive: true });
    await pipeline(stream, createWriteStream(target));
    const { size } = await stat(target);
    return size;
  },

  read(key) {
    return createReadStream(resolve(env.storageLocalPath, key));
  },

  async remove(key) {
    await rm(resolve(env.storageLocalPath, key), { force: true });
  },
};

const drivers = { local: localDriver };

export const storage = drivers[env.storageDriver];

if (!storage) {
  throw new Error(
    `Pilote de stockage inconnu : ${env.storageDriver} (attendu : ${Object.keys(drivers).join(", ")})`,
  );
}
