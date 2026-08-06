// Registre des modules métier de CompanyOS.
//
// Chaque module est un dossier dans src/apps/modules/<slug>/ dont
// l'index.jsx exporte un `manifest` :
//
//   { slug, name, icon, action, Window }
//
//   slug   — identifiant, doit correspondre au slug du catalogue (seed.js)
//   icon   — nom d'un PNG de public/img/icon, UNIQUE (clé d'état des fenêtres)
//   action — chaîne d'action Redux, UNIQUE (ex. "QRCODEAPP")
//   Window — le composant de la fenêtre
//
// Ce fichier découvre les modules tout seul : créer le dossier suffit.
// Les dossiers préfixés par _ (comme _template) sont ignorés.

const found = import.meta.glob(
  ["./modules/*/index.jsx", "!./modules/_*/index.jsx"],
  { eager: true },
);

export const modules = Object.values(found)
  .map((mod) => mod.manifest)
  .filter(Boolean);

export const moduleBySlug = Object.fromEntries(
  modules.map((mod) => [mod.slug, mod]),
);
