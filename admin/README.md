# Kivli Admin

Tableau de bord privé de la plateforme Kivli.

- Deploiement separe du site public via Cloudflare Workers.
- Acces protege par un compte administrateur distinct.
- Mot de passe conserve uniquement sous forme PBKDF2, jamais en clair.
- Sessions privees de 12 heures avec cookie securise et jeton hache.
- Tentatives de connexion limitees et verrouillage temporaire.
- Données lues depuis la même base D1 européenne que Kivli.
- Actions sensibles journalisees dans `admin_audit_log`.

Variables Worker requises :

- `ADMIN_EMAIL_V2` : adresse de connexion de l'administrateur.
- `ADMIN_PASSWORD_HASH_V2` : empreinte PBKDF2 du mot de passe.
- `SESSION_PEPPER_V2` : secret aleatoire servant a proteger les sessions.
