# Modules CompanyOS

Un module est une application métier installable depuis la Boutique.
**Un module non installé n'existe pas dans le shell** : ni icône sur le bureau,
ni entrée au menu Démarrer, ni fenêtre montée.

## Créer une app en 4 étapes

**1. Copier le modèle**

```bash
cp -r src/apps/modules/_template src/apps/modules/facturation
```

**2. Adapter le manifeste** dans `index.jsx`

```js
export const manifest = {
  slug: "facturation",     // = le slug du catalogue serveur
  name: "Facturation",     // affiché partout dans le shell
  icon: "msoffice",        // un PNG de public/img/icon/, UNIQUE
  action: "FACTURATIONAPP",// action Redux, UNIQUE
  Window: FacturationApp,
};
```

`icon` sert de clé à l'état de fenêtre et `action` déclenche son ouverture :
les deux doivent être uniques dans tout le shell.

**3. Déclarer l'app au catalogue** dans `server/prisma/seed.js`, avec le même
slug, puis :

```bash
cd server && node prisma/seed.js
```

**4. Écrire la fenêtre.** `ModuleWindow` fournit le chrome (barre de titre,
réduire / agrandir / fermer, déplacement, z-index) :

```jsx
<ModuleWindow manifest={manifest} className="factApp">
  ...votre contenu...
</ModuleWindow>
```

Rien d'autre à câbler : `src/apps/registry.js` découvre le dossier tout seul.

## Mise en page

Reprenez la charte du générateur QR : jetons de thème portés par la classe
racine du module, sections numérotées, chips, champs, bouton principal.

Mais **ne mettez pas de barre latérale ni de panneau d'aperçu si le module n'en
a pas besoin.** La colonne centrale suffit souvent. Ajoutez la nav quand il y a
assez de sections pour s'y perdre (4 et plus), et le panneau de droite quand il
y a vraiment quelque chose à garder sous les yeux — un aperçu vivant, un total
qui bouge, une action principale qui doit rester atteignable.

| Module        | Mise en page                                    |
| ------------- | ----------------------------------------------- |
| `qrcode`      | nav + centre + aperçu (le QR change en direct)   |
| `facturation` | nav + centre + panneau (total et statut)         |
| `crm`         | nav + centre + panneau (fiche du client)         |
| `stock`       | **une seule colonne** — rien à prévisualiser     |

## Persister des données

Aucune migration à écrire. Chaque module range ses enregistrements dans des
collections libres, cloisonnées par espace de travail :

```js
await api.records.create("facturation", "factures", { client: "Awa", total: 250000 });
const factures = await api.records.list("facturation", "factures");
await api.records.update("facturation", "factures", id, { ...donnees });
await api.records.remove("facturation", "factures", id);
```

Les données vivent en JSONB dans la table `records`. Quand un module se
stabilise, on le sort vers de vraies tables typées sans changer son interface.

## Écrire des fichiers

**Règle : tout fichier produit ou importé par une app va dans le cloud du
tenant**, donc dans l'Explorateur. Jamais un simple téléchargement navigateur —
sinon le fichier sort du produit : invisible pour les collègues, non décompté
du quota facturé.

Quand c'est **l'utilisateur** qui demande d'enregistrer, utilisez `saveAs` :
il ouvre le cloud pour qu'il choisisse le dossier et le nom, comme dans
l'Explorateur.

```js
import { saveAs, dataUrlToBlob } from "../../cloud";

const blob = await dataUrlToBlob(canvas.toDataURL());
const node = await saveAs(blob, "rapport.png", { folder: manifest.name });
if (node) flash(`« ${node.name} » enregistré`); // null si l'utilisateur annule
```

`saveToCloud` a la même signature mais écrit directement dans le dossier du
module, sans rien demander : à réserver aux écritures automatiques.

Les deux dédoublonnent le nom (« rapport (2).png »), mettent à jour le quota
et rafraîchissent l'Explorateur. Un bouton de téléchargement local peut
exister **en plus**, jamais à la place.

## Piège à connaître : les formulaires

Toujours mettre à jour un état de formulaire avec la forme **fonctionnelle** :

```js
// ✗ `draft` vient de la closure du rendu courant. Si plusieurs champs
//   changent avant le rendu suivant (collage, remplissage auto, saisie
//   rapide), les modifications précédentes sont écrasées — et un formulaire
//   fraîchement ouvert peut hériter des données de la fiche précédente.
setDraft({ ...draft, [key]: value });

// ✓
setDraft((d) => ({ ...d, [key]: value }));
```

## Exemples complets

- `src/apps/modules/qrcode/` — six types de contenu, options d'apparence,
  historique partagé via `api.records`, export cloud via `saveToCloud`.
- `src/apps/modules/crm/` — liste maître/détail, recherche, filtres, sous-
  collection liée (opportunités rattachées à un client), export CSV.
- `src/apps/modules/facturation/` — lignes calculées, lecture des clients et
  des articles d'autres modules (`api.records.list("crm", "clients")`),
  génération PDF sans dépendance (`pdf.js`).
- `src/apps/modules/stock/` — module en une seule colonne, sans nav ni panneau.
  Le stock n'est jamais stocké : il se déduit de la somme des mouvements, donc
  rien ne peut diverger de l'historique.
