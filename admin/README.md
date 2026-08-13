# Tampo Admin

Tableau de bord prive de la plateforme Tampo.

- Deploiement separe du site public via Cloudflare Workers.
- Acces protege par Cloudflare Access.
- Identite validee cote Worker avec le JWT signe par Cloudflare.
- Donnees lues depuis la meme base D1 europeenne que Tampo.
- Actions sensibles journalisees dans `admin_audit_log`.

Variables Worker requises apres activation de Cloudflare Access :

- `TEAM_DOMAIN` : domaine d'equipe Cloudflare Access complet.
- `POLICY_AUD` : audience de l'application Access.
