# Sauvegardes cloud-first de Kivli

Ce Worker séparé sauvegarde `kivli-production-eu` directement vers le bucket R2 privé `kivli-d1-backups`. Aucun dump ne transite par le Mac.

## Fonctionnement

- Un Cron Trigger Cloudflare gratuit démarre chaque jour à 02:15 UTC et lance le Workflow durable.
- Il demande un export complet à la D1 Export API (`schéma + données`).
- Le flux SQL est transféré directement vers R2.
- Le nom contient la base et l'horodatage UTC.
- Un manifeste JSON adjacent conserve le bookmark D1, la taille et l'ETag R2.
- Un nouvel export n'est conservé que si son contenu diffère du dernier export valide ; le doublon transitoire est immédiatement supprimé.
- Les étapes réseau sont retentées durablement et un même déclenchement ne crée pas de doublon.
- Le Worker n'a ni URL `workers.dev`, ni Preview URL, ni domaine personnalisé.
- Le bucket n'a ni URL publique `r2.dev`, ni domaine personnalisé.
- La rétention conserve une sauvegarde par jour pendant 30 jours, une par semaine jusqu'à 90 jours, puis une par mois jusqu'à un an.
- Une règle de cycle de vie R2 à 365 jours sert de limite de sécurité indépendante et empêche toute croissance infinie.

Le Cron Trigger standard est utilisé à la place de la planification intégrée au binding Workflow, car cette dernière exige un abonnement Workers payant. Cette architecture reste entièrement dans le niveau gratuit avec un déclenchement quotidien.

## Protection en deux niveaux

1. **Incident récent : D1 Time Travel** — restaurer à la minute précédant l'incident. Time Travel reste actif et indépendant de ce Workflow.
2. **Incident ancien ou restauration isolée : export R2** — restaurer dans une nouvelle D1 EU distincte, valider, puis seulement basculer la liaison du Worker.

## Restauration cloud-first depuis R2

Ne jamais importer un export complet sur la D1 de production existante.

1. Mettre les écritures applicatives en maintenance.
2. Créer une D1 de récupération avec `--jurisdiction eu`.
3. Vérifier que son UUID est différent de `2294e62a-ebce-4514-b440-36fbd3569363`.
4. Depuis un Workflow de récupération temporaire Cloudflare :
   - lire l'objet SQL privé avec la liaison R2 ;
   - utiliser son ETag pour initialiser la D1 Import API ;
   - transférer le flux R2 vers l'URL temporaire d'import Cloudflare ;
   - lancer l'ingestion puis suivre son bookmark jusqu'à la fin.
5. Comparer schéma, volumes et relations avec le manifeste de sauvegarde.
6. Basculer la liaison D1 applicative uniquement après validation complète.
7. Ne supprimer l'ancienne base qu'après validation formelle de la nouvelle production.

Cette procédure garde le dump dans Cloudflare pendant tout le transfert. Un téléchargement ponctuel ne doit être utilisé qu'en dernier recours, dans un répertoire système temporaire immédiatement supprimé.

## Secret requis

`D1_REST_API_TOKEN` est un jeton Cloudflare limité au compte Kivli et à la permission D1 nécessaire à l'export. Il est stocké uniquement comme secret du Worker `kivli-d1-backup-orchestrator`.

## Déploiement et test

```sh
pnpm run check
pnpm run deploy
pnpm dlx wrangler@4.125.0 secret put D1_REST_API_TOKEN
pnpm run trigger
pnpm dlx wrangler@4.125.0 workflows instances list kivli-d1-backup-daily
```
