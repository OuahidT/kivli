# Tampo Admin

Tableau de bord prive de la plateforme Tampo.

- Deploiement separe du site public via Cloudflare Workers.
- Acces protege par un compte administrateur distinct.
- Mot de passe conserve uniquement sous forme PBKDF2, jamais en clair.
- Sessions privees de 12 heures avec cookie securise et jeton hache.
- Tentatives de connexion limitees et verrouillage temporaire.
- Donnees lues depuis la meme base D1 europeenne que Tampo.
- Actions sensibles journalisees dans `admin_audit_log`.

Variables Worker requises :

- `ADMIN_EMAIL_V2` : adresse de connexion de l'administrateur.
- `ADMIN_PASSWORD_HASH_V2` : empreinte PBKDF2 du mot de passe.
- `SESSION_PEPPER_V2` : secret aleatoire servant a proteger les sessions.
