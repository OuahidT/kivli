# Kivli

MVP SaaS de fidélité digitale multi-commerçants.

## Infrastructure de production

- code source privé sur GitHub, branche `main` ;
- application officielle : <https://kivli.fr>, déployée sur Cloudflare Worker ;
- ancienne adresse Worker conservée pour la compatibilité des liens existants :
  <https://kivli.ouahid-taileb.workers.dev> ;
- administration déployée sur un Worker séparé :
  <https://kivli-admin.ouahid-taileb.workers.dev> ;
- base relationnelle `kivli-production-eu` sur Cloudflare D1 avec juridiction UE ;
- aucun service Supabase ou Vercel.

## Développement

Prérequis : Node.js 22.13 ou plus récent et pnpm.

```bash
pnpm install --frozen-lockfile
pnpm run dev
pnpm run build
```

Le binding D1 utilisé par l'application et l'administration s'appelle `DB`.

## Déploiement

```bash
pnpm run deploy
```

Le déploiement ne doit être lancé qu'après création de la base D1, application
des migrations et contrôle d'intégrité. Les deux Workers sont également reliés
à GitHub pour redéployer automatiquement la branche `main` avec un jeton de
build Kivli dédié. Les branches temporaires ne sont pas conservées après
validation.
