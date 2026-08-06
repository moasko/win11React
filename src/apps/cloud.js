// Point de passage unique des fichiers dans CompanyOS.
//
// RÈGLE : tout fichier importé ou produit par une app de l'OS atterrit dans
// le cloud de l'espace de travail, donc dans l'Explorateur. Aucune app ne
// garde ses fichiers pour elle, et aucune ne s'arrête à un téléchargement
// navigateur — sinon le fichier sort du produit : invisible pour les
// collègues et non décompté du quota facturé.
//
//   import { saveToCloud } from "../../cloud";
//   await saveToCloud(blob, "facture.pdf", { folder: "Facturation" });

import store from "../reducers";
import { api } from "../api/client";

/// Trouve le dossier `name` à la racine du cloud, ou le crée.
const ensureRootFolder = async (name) => {
  const root = await api.listFiles(null);
  const found = root.find((n) => n.type === "FOLDER" && n.name === name);
  if (found) return found.id;

  try {
    const created = await api.createFolder(name, null);
    return created.id;
  } catch {
    // Course entre deux enregistrements simultanés : on relit.
    const retry = await api.listFiles(null);
    return retry.find((n) => n.type === "FOLDER" && n.name === name)?.id || null;
  }
};

/// Un nom déjà pris dans le dossier renvoie un conflit côté API.
/// On suffixe alors « (2) », « (3) »… comme le ferait un explorateur.
const uniqueName = (name, taken) => {
  if (!taken.has(name)) return name;

  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";

  let i = 2;
  while (taken.has(`${base} (${i})${ext}`)) i += 1;
  return `${base} (${i})${ext}`;
};

/// Enregistre un Blob/File dans le cloud du tenant.
/// `folder` : dossier de destination à la racine (celui du module, en général).
/// Renvoie le nœud créé.
export const saveToCloud = async (blob, filename, { folder } = {}) => {
  const parentId = folder ? await ensureRootFolder(folder) : null;

  const siblings = await api.listFiles(parentId);
  const name = uniqueName(filename, new Set(siblings.map((n) => n.name)));

  const file = new File([blob], name, {
    type: blob.type || "application/octet-stream",
  });

  const node = await api.uploadFile(file, parentId);

  // L'Explorateur se rafraîchit, le quota affiché suit.
  store.dispatch({ type: "CLOUD_TOUCH" });
  try {
    const usage = await api.usage();
    store.dispatch({ type: "SESSION_USAGE", payload: { usedBytes: usage.usedBytes } });
  } catch {
    /* l'affichage du quota se remettra à jour à la prochaine lecture */
  }

  return node;
};

/// Convertit une data-URL (canvas, QR, graphique…) en Blob.
export const dataUrlToBlob = async (dataUrl) => (await fetch(dataUrl)).blob();
