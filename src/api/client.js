// Client de l'API CompanyOS.
// Le jeton est conservé dans localStorage et rejoué à chaque appel.

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
const TOKEN_KEY = "companyos-token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

const request = async (path, { method = "GET", body, isForm = false } = {}) => {
  const headers = {};
  const token = getToken();

  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !isForm) headers["Content-Type"] = "application/json";

  const response = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) return null;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error || `Erreur ${response.status}`);
  }

  return payload;
};

export const api = {
  register: (data) => request("/auth/register", { method: "POST", body: data }),
  login: (data) => request("/auth/login", { method: "POST", body: data }),
  me: () => request("/auth/me"),

  catalog: () => request("/apps/catalog"),
  installedApps: () => request("/apps/installed"),
  installApp: (slug) => request(`/apps/${slug}/install`, { method: "POST" }),
  uninstallApp: (slug) => request(`/apps/${slug}/install`, { method: "DELETE" }),

  usage: () => request("/files/usage"),
  listFiles: (parentId) =>
    request(`/files${parentId ? `?parentId=${encodeURIComponent(parentId)}` : ""}`),
  createFolder: (name, parentId = null) =>
    request("/files/folder", { method: "POST", body: { name, parentId } }),
  deleteNode: (id) => request(`/files/${id}`, { method: "DELETE" }),

  uploadFile: (file, parentId = null) => {
    const form = new FormData();
    if (parentId) form.append("parentId", parentId);
    form.append("file", file);
    return request("/files/upload", { method: "POST", body: form, isForm: true });
  },

  downloadUrl: (id) => `${BASE_URL}/api/files/${id}/download`,

  // Données génériques des modules : chaque app range ses enregistrements
  // dans des collections nommées, sans migration côté serveur.
  records: {
    list: (module, collection) => request(`/records/${module}/${collection}`),
    create: (module, collection, data) =>
      request(`/records/${module}/${collection}`, { method: "POST", body: { data } }),
    update: (module, collection, id, data) =>
      request(`/records/${module}/${collection}/${id}`, { method: "PUT", body: { data } }),
    remove: (module, collection, id) =>
      request(`/records/${module}/${collection}/${id}`, { method: "DELETE" }),
  },
};
