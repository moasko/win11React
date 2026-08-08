// Ouverture d'un fichier du cloud dans l'application qui sait le lire.
//
// Même principe que `saveRequest` et `modalRequest` : un petit magasin hors
// Redux. Un nœud de fichier n'a rien à faire dans le store — il est
// transitoire, et la visionneuse est la seule à s'y intéresser.

import { familleDe } from "./fileTypes";
import { ouvrirFenetre } from "./windows";

const abonnes = new Map(); // action Redux → fonction de rendu
const courant = new Map(); // action Redux → { node, voisins }

/// Une visionneuse s'abonne à son action et reçoit le fichier à afficher.
export const subscribeVisionneuse = (action, fn) => {
  abonnes.set(action, fn);
  fn(courant.get(action) || null);
  return () => abonnes.delete(action);
};

/// Ouvre un fichier dans l'application associée à son type.
///
/// `voisins` est le contenu du dossier : la visionneuse s'en sert pour
/// passer à l'image suivante ou enchaîner les morceaux, sans rien
/// redemander au serveur.
///
/// Renvoie `false` si aucune application ne sait ouvrir ce fichier —
/// à l'appelant de retomber sur le téléchargement.
export const ouvrirFichier = (node, voisins = []) => {
  const famille = familleDe(node);
  if (!famille) return false;

  const charge = { node, voisins, famille };
  courant.set(famille.action, charge);
  abonnes.get(famille.action)?.(charge);

  ouvrirFenetre(famille.app);
  return true;
};

/// Ce que la visionneuse affiche en ce moment — utile au rendu initial.
export const fichierCourant = (action) => courant.get(action) || null;

/// Vide une visionneuse (fermeture de sa fenêtre).
export const oublierFichier = (action) => {
  courant.delete(action);
  abonnes.get(action)?.(null);
};
