# CompanyOS

Un système d'exploitation web : un bureau unique dans le navigateur, qui réunit
les applications de gestion de l'entreprise et les fait communiquer entre elles.
Chaque client dispose d'un espace de travail avec son propre stockage, et installe
depuis la Boutique les modules dont il a besoin.

Le shell est un fork de [win11React](https://github.com/blueedgetechno/win11React)
(licence Creative Commons), débarrassé de ses applications de démonstration et rebrandé.

## Structure

| Dossier   | Rôle                                                           |
| --------- | -------------------------------------------------------------- |
| `src/`    | Shell : bureau, fenêtres, barre des tâches, menu Démarrer.      |
| `server/` | API : comptes, espaces de travail, quota, catalogue, fichiers.  |
| `public/` | Icônes, fonds d'écran, traductions.                            |

**Shell** — React 18 · Vite 3 · Redux · SCSS
**API** — Node 22 · Fastify 5 · Prisma 6 · PostgreSQL 17

## Démarrer

```bash
npm install && npm start
```

Le shell tourne sur `http://localhost:5173`. Pour l'API, voir
[server/README.md](server/README.md).

## Deux familles d'applications

**Le socle** (`src/containers/applications/apps/`) est toujours présent :
Explorateur, Boutique, Terminal, Bloc-notes, Calculatrice, Paramètres,
Gestionnaire de tâches, Corbeille.

**Les modules métier** (`src/apps/modules/`) s'installent depuis la Boutique.
Un module non installé n'existe pas dans le shell : ni icône, ni fenêtre.
Créer une app se résume à copier `src/apps/modules/_template/` et à déclarer
l'app au catalogue — voir [src/apps/README.md](src/apps/README.md).

## Fichiers

L'Explorateur **est** le cloud de l'espace de travail. Tout fichier importé ou
produit par une app y atterrit, via `saveToCloud()` dans `src/apps/cloud.js`.
Aucune app ne garde ses fichiers pour elle.
