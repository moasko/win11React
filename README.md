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

## Ajouter une application au shell

Trois endroits à toucher :

1. `src/utils/apps.js` — l'entrée du registre : `{ name, icon, type, action }`.
   La chaîne `action` est ce qui pilote l'ouverture de la fenêtre.
2. `src/containers/applications/apps/` — le composant de la fenêtre, réexporté
   depuis `src/containers/applications/index.jsx`.
3. `src/reducers/apps.js` — l'état des fenêtres, indexé par `icon`.

Le catalogue de la Boutique vit côté API (`server/prisma/seed.js`) : une app y est
décrite pour être proposée à l'installation, indépendamment de son composant.
