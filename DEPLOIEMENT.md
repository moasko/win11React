# Déployer CompanyOS sur un VPS avec Dokploy

CompanyOS se déploie en trois conteneurs — base PostgreSQL, API Fastify,
front statique — décrits dans [docker-compose.prod.yml](docker-compose.prod.yml).
Dokploy construit les images, applique les migrations et enchaîne les
redéploiements sans perte de données : la base et les fichiers du cloud
vivent dans des volumes.

## 1. Prérequis

- Un VPS avec [Dokploy](https://dokploy.com) installé
  (`curl -sSL https://dokploy.com/install.sh | sh`).
- Deux sous-domaines pointant (enregistrement A) vers le VPS, par exemple :
  - `os.mondomaine.com` — le front ;
  - `api.mondomaine.com` — l'API.
- Ce dépôt accessible à Dokploy (GitHub, GitLab, ou dépôt privé avec clé).

## 2. Créer le service

Dans Dokploy : **Create Project** → **Create Service** → type **Docker Compose**.

- **Source** : ce dépôt, branche `master`.
- **Compose file** : `docker-compose.prod.yml`.

## 3. Variables d'environnement

Onglet **Environment** du service — toutes sont exigées sauf mention :

| Variable | Valeur | Rôle |
|---|---|---|
| `POSTGRES_PASSWORD` | un mot de passe fort | la base |
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` | signature des sessions |
| `CORS_ORIGIN` | `https://os.mondomaine.com` | le front autorisé à appeler l'API |
| `VITE_API_URL` | `https://api.mondomaine.com` | figée dans le build du front |
| `JWT_EXPIRES_IN` | `7d` (défaut) | durée d'une session |
| `DEFAULT_TENANT_QUOTA` | `5368709120` (défaut, 5 Go) | quota d'un nouvel espace |

> `VITE_API_URL` est cuite **au build** : la changer exige un redéploiement,
> pas seulement un redémarrage.

## 4. Domaines

Onglet **Domains** du service :

| Domaine | Service | Port | HTTPS |
|---|---|---|---|
| `os.mondomaine.com` | `web` | `80` | oui (Let's Encrypt) |
| `api.mondomaine.com` | `api` | `4000` | oui (Let's Encrypt) |

Dokploy (Traefik) obtient et renouvelle les certificats tout seul.

## 5. Déployer

Bouton **Deploy**. Au premier démarrage, l'API :

1. applique les migrations Prisma (`prisma migrate deploy`) ;
2. rejoue le seed — idempotent : il remplit le catalogue de la Boutique
   sans jamais écraser les données existantes ;
3. démarre sur le port 4000 (`/health` répond `{"status":"ok"}`).

Ouvrez ensuite `https://os.mondomaine.com` et créez le premier espace de
travail depuis l'écran d'inscription — son créateur en devient le
propriétaire (formule Découverte ; la formule se change dans
Paramètres → Formule et tarifs).

## 6. Données et sauvegardes

Deux volumes portent tout l'état :

- `postgres-data` — la base (comptes, enregistrements des modules, journal) ;
- `storage-data` — les fichiers du cloud des espaces de travail.

Sauvegardes : l'onglet **Backups** de Dokploy sait planifier des dumps
PostgreSQL vers un stockage S3. Pour les fichiers, archivez le volume
`storage-data` (le chemin réel est visible dans **Volumes**) — un `tar`
planifié vers le même bucket suffit.

## 7. Mises à jour

`git push`, puis **Deploy** (ou activez l'auto-deploy par webhook dans
l'onglet **Deployments**). Les migrations s'appliquent au démarrage ; les
volumes traversent les redéploiements intacts.

## Dépannage

- **L'écran de connexion tourne en boucle** : `CORS_ORIGIN` ne correspond
  pas exactement au domaine du front (schéma `https://` compris).
- **Le front appelle localhost:4000** : `VITE_API_URL` manquait au build —
  renseignez-la puis redéployez.
- **`migrate deploy` échoue** : la base n'était pas prête ; le
  `depends_on: service_healthy` l'attend, mais un premier démarrage très
  lent peut nécessiter un simple redéploiement.
