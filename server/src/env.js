import "dotenv/config";

const required = (key) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Variable d'environnement manquante : ${key}. Copiez server/.env.example vers server/.env.`,
    );
  }
  return value;
};

export const env = {
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  port: Number(process.env.PORT || 4000),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  storageDriver: process.env.STORAGE_DRIVER || "local",
  storageLocalPath: process.env.STORAGE_LOCAL_PATH || "./storage",
  defaultTenantQuota: BigInt(
    process.env.DEFAULT_TENANT_QUOTA || 5 * 1024 * 1024 * 1024,
  ),
};
