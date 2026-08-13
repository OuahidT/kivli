# Tampo

MVP SaaS de fidélité digitale multi-commerçants.

## Infrastructure cible

- code source privé sur GitHub ;
- application déployée sur Cloudflare Workers ;
- base relationnelle Cloudflare D1 créée avec juridiction UE ;
- aucun service Supabase ou Vercel.

La branche `main` conserve l'import exact de la version 6 de ChatGPT Sites.
La préparation de la production Cloudflare se fait sur la branche
`migration/cloudflare-workers` jusqu'à la validation complète.

## Développement

Prérequis : Node.js 22.13 ou plus récent et pnpm.

```bash
pnpm install --frozen-lockfile
pnpm run dev
pnpm run build
```

Le binding D1 attendu par l'application s'appelle `DB`. L'identifiant nul dans
`wrangler.jsonc` est volontaire : il sera remplacé par l'identifiant réel de la
nouvelle base D1 européenne avant tout déploiement.

## Déploiement

```bash
pnpm run deploy
```

Le déploiement ne doit être lancé qu'après création de la base D1, application
des migrations, import des données et contrôle d'intégrité.
