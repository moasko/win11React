import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { ModuleWindow } from "../../ModuleWindow";
import { api } from "../../../api/client";

// ---------------------------------------------------------------------------
// MODÈLE DE MODULE COMPANYOS
//
// Pour créer une app :
//   1. Copier ce dossier vers src/apps/modules/<slug>/
//   2. Adapter le `manifest` ci-dessous (slug, name, icon, action)
//   3. Ajouter l'app au catalogue dans server/prisma/seed.js avec le MÊME slug,
//      puis relancer  node prisma/seed.js
//   4. Écrire le contenu de la fenêtre
//
// Le dossier _template est ignoré par le registre : il ne s'affiche jamais.
//
// Règles à respecter :
//   - `icon` doit être un PNG existant dans public/img/icon/ et être UNIQUE
//     (c'est la clé de l'état de fenêtre dans Redux)
//   - `action` doit être UNIQUE (chaîne d'action Redux, en MAJUSCULES)
//   - `slug` doit correspondre au slug du catalogue côté serveur
//
// Persistance : pas de migration à écrire. Rangez vos données via
// api.records dans (module, collection) — les deux sont libres :
//
//   await api.records.create("<slug>", "clients", { nom: "Awa", ville: "Abidjan" })
//   const clients = await api.records.list("<slug>", "clients")
//   await api.records.update("<slug>", "clients", id, { ...donnees })
//   await api.records.remove("<slug>", "clients", id)
//
// Les données sont automatiquement cloisonnées par espace de travail.
// ---------------------------------------------------------------------------

export const manifest = {
  slug: "template",
  name: "Mon module",
  icon: "notes",
  action: "TEMPLATEAPP",
  Window: TemplateApp,
};

function TemplateApp() {
  const wnapp = useSelector((state) => state.apps[manifest.icon]);
  const session = useSelector((state) => state.session);
  const [items, setItems] = useState([]);

  // Charge les données à l'ouverture de la fenêtre.
  useEffect(() => {
    if (!wnapp || wnapp.hide || session.status !== "authenticated") return;
    api.records
      .list(manifest.slug, "items")
      .then(setItems)
      .catch(() => setItems([]));
  }, [wnapp?.hide, session.status]);

  return (
    <ModuleWindow manifest={manifest} className="templateApp">
      <div style={{ padding: 20 }}>
        <p>Contenu du module. {items.length} enregistrement(s).</p>
      </div>
    </ModuleWindow>
  );
}
