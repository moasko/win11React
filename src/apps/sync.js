// Synchronisation entre les installations côté API et le shell.
// Un module installé apparaît (bureau, menu Démarrer, fenêtre) ;
// un module non installé n'existe nulle part.

import store from "../reducers";
import { api } from "../api/client";
import { modules, moduleBySlug } from "./registry";

const toAppEntry = (mod) => ({
  name: mod.name,
  icon: mod.icon,
  type: "app",
  action: mod.action,
});

/// Fait apparaître un module dans le shell.
export const attachModule = (mod) => {
  const state = store.getState();

  if (!state.apps[mod.icon]) {
    store.dispatch({ type: "ADDAPP", payload: toAppEntry(mod) });
  }
  if (!state.desktop.apps.some((a) => a.name === mod.name)) {
    store.dispatch({ type: "DESKADD", payload: toAppEntry(mod) });
  }
};

/// Retire un module du shell (fenêtre fermée, icônes enlevées).
export const detachModule = (mod) => {
  const state = store.getState();
  if (state.apps[mod.icon]) {
    store.dispatch({ type: mod.action, payload: "close" });
    store.dispatch({ type: "DELAPP", payload: mod.icon });
  }
  store.dispatch({ type: "DESKREM", payload: mod.name });
};

/// Aligne le shell sur la liste d'installations de l'espace de travail.
/// Appelée à l'ouverture de session et après chaque (dés)installation.
export const syncInstalledModules = async () => {
  const installed = await api.installedApps();
  const installedSlugs = new Set(installed.map((a) => a.slug));

  for (const mod of modules) {
    if (installedSlugs.has(mod.slug)) attachModule(mod);
    else detachModule(mod);
  }
};

/// À la déconnexion : plus de session, plus de modules.
export const detachAllModules = () => {
  for (const mod of modules) detachModule(mod);
};

export { moduleBySlug };
