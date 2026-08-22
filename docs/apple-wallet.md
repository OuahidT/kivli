# Apple Wallet — préparation Kivli

Le socle Apple Wallet utilise un pass `storeCard`. Kivli/D1 reste l’unique source de vérité : le pass ne contient qu’une représentation signée des données courantes.

## Identité du pass

- un Pass Type ID unique pour Kivli, à créer après l’adhésion Apple Developer ;
- un numéro de série stable dérivé de l’identifiant d’adhésion Kivli ;
- le QR code pointe vers la même carte `https://kivli.fr/c/{code}` que la carte web et Google Wallet ;
- le jeton d’authentification est dérivé par HMAC et seule son empreinte est conservée dans D1.

## Secrets Cloudflare réservés

- `APPLE_WALLET_AUTH_SECRET`
- `APPLE_WALLET_PASS_TYPE_ID`
- `APPLE_WALLET_TEAM_ID`
- `APPLE_WALLET_SIGNING_CERTIFICATE_PEM`
- `APPLE_WALLET_SIGNING_PRIVATE_KEY_PEM`
- `APPLE_WALLET_WWDR_CERTIFICATE_PEM`
- `APPLE_WALLET_ENABLED` — ne doit valoir `1` qu’après un test réel réussi.

Aucune clé privée, aucun certificat et aucun jeton ne doivent être ajoutés à GitHub.

## Service web prêt

Base : `https://kivli.fr/api/apple-wallet`

- enregistrement et désenregistrement des appareils ;
- consultation des numéros de série mis à jour ;
- restitution du nouveau `.pkpass` signé ;
- réception des diagnostics Wallet ;
- marquage des cartes à notifier après passage, achat, bonus, récompense ou annulation.

## Après l’adhésion payante

1. créer le Pass Type ID Kivli ;
2. créer le certificat Pass Type ID et exporter sa clé privée ;
3. ajouter le Team ID, le Pass Type ID, le certificat, la clé et le certificat WWDR dans les secrets Cloudflare ;
4. connecter l’adaptateur de signature PKCS#7, ajouter les images requises au paquet et générer le premier `.pkpass` ;
5. accepter la licence d’illustration Wallet et ajouter le badge SVG français officiel fourni par Apple ;
6. installer le pass sur un iPhone, valider les enregistrements, les notifications APNs et toutes les mises à jour ;
7. activer `APPLE_WALLET_ENABLED=1` seulement après réussite de la recette.

Références officielles :

- https://developer.apple.com/documentation/walletpasses/creating-a-store-card-pass
- https://developer.apple.com/documentation/walletpasses/adding-a-web-service-to-update-passes
- https://developer.apple.com/help/account/capabilities/create-wallet-identifiers-and-certificates/
- https://developer.apple.com/wallet/add-to-apple-wallet-guidelines/

