import { sha256 } from "./ids";

export const LEGAL_VERSION = "2026-08-27";
export const PILOT_TERMS_VERSION = "2026-08-27";
export const DATA_PROCESSING_AGREEMENT_VERSION = "2026-08-21";
export const MARKETING_CONSENT_VERSION = "sms-v1-2026-08-21";

export const PILOT_DURATION_REMINDER = "Pilote gratuit pendant 60 jours, sans carte bancaire, sans prélèvement, sans renouvellement automatique et sans obligation d’achat. Si aucune décision commerciale n’est prise à l’issue des 60 jours, l’accès reste fonctionnel et peut être prolongé gratuitement.";

export const PILOT_TERMS_CANONICAL_TEXT = `Conditions du pilote gratuit
Version du 27 août 2026
Ces conditions encadrent l’accès professionnel à Kivli avant son éventuelle commercialisation. Elles ne constituent pas des CGV payantes.

1. Objet et acceptation
Kivli met à disposition des commerces et professionnels un outil de fidélité digitale comprenant notamment la création d’un programme, des cartes clients, la gestion des points et récompenses, des accès employés et un historique. L’accès aux fonctions impliquant les données des clients est activé lorsque le propriétaire authentifié confirme être habilité à engager le commerce et accepte expressément les présentes conditions ainsi que l’annexe RGPD.

2. Pilote entièrement gratuit
Le pilote est fourni gratuitement pendant 60 jours à compter de son activation effective, laquelle intervient après l’acceptation obligatoire des présentes conditions et de l’annexe RGPD par le propriétaire habilité. Aucun moyen de paiement n’est demandé, aucun prélèvement n’est réalisé, aucune facturation ni reconduction payante ou automatique ne se déclenche et aucune obligation d’achat n’est créée.
À l’issue des 60 jours, le commerce n’est pas bloqué automatiquement. Si aucune décision commerciale n’a encore été prise, son accès reste fonctionnel et Kivli peut prolonger gratuitement le pilote. Toute future offre payante fera l’objet d’une proposition et d’un accord explicite distincts du commerçant ; l’absence de réponse, la poursuite de l’accès ou l’expiration du compteur ne pourront jamais valoir souscription.

3. Accès au service
Le commerçant fournit des informations exactes, protège son code confidentiel, limite les accès employés aux personnes autorisées et signale rapidement tout usage suspect. Il reste responsable des appareils et réseaux utilisés pour accéder à Kivli.

4. Responsabilité du programme
Le commerçant définit les règles de son programme, les conditions d’attribution des points et les récompenses promises. Il s’engage à présenter ces règles clairement, à honorer les récompenses valablement acquises, à corriger les erreurs et à respecter le droit applicable à son activité. Kivli fournit l’outil technique mais n’est ni le vendeur des produits du commerçant ni le débiteur des récompenses.

5. Données des clients
Le commerçant est responsable des traitements liés à son programme. Il doit informer ses clients, n’utiliser leurs données que pour les finalités annoncées, traiter leurs demandes de droits et ne prospecter par SMS que sur la base d’un accord valable. Kivli agit comme sous-traitant selon l’annexe de traitement des données.

6. Disponibilité et évolutions
Le pilote sert à tester et améliorer Kivli. Des opérations de maintenance ou des anomalies peuvent temporairement affecter le service. Kivli met en œuvre des moyens raisonnables pour préserver la continuité, la sécurité et les données, sans garantir une disponibilité absolue. Les fonctions essentielles ne seront pas volontairement retirées sans information préalable raisonnable, sauf urgence de sécurité ou obligation légale.

7. Retours et contenus
Les idées et retours peuvent être utilisés pour améliorer Kivli sans transférer au service les droits portant sur les marques, contenus ou données du commerçant. Le commerçant garantit disposer des droits nécessaires sur les textes et éléments qu’il renseigne.

8. Fin du pilote et réversibilité
Le commerçant peut quitter le pilote à tout moment en écrivant à contact@kivli.fr. Kivli peut mettre fin au pilote avec un préavis raisonnable de 30 jours, sauf sécurité, usage illicite ou impossibilité majeure. Sur demande reçue avant la fermeture, Kivli fournit une restitution exploitable des données du commerce dans un format courant. Les données opérationnelles sont ensuite supprimées dans les 30 jours, hors éléments dont la conservation limitée est nécessaire à une obligation ou à la défense de droits.

9. Responsabilité
Chaque partie répond des dommages directs causés par ses fautes ou manquements. Compte tenu du caractère gratuit et expérimental du pilote, Kivli ne répond pas des pertes indirectes ni des décisions commerciales prises uniquement à partir des indicateurs du service. Cette limitation ne s’applique pas en cas de faute lourde, dol, atteinte aux données personnelles imputable à Kivli ou lorsqu’une règle impérative l’interdit.

10. Droit applicable et contact
Les présentes conditions sont soumises au droit français. En cas de difficulté, les parties cherchent d’abord une solution amiable en écrivant à contact@kivli.fr. Les règles impératives de compétence restent applicables.`;

export const DATA_PROCESSING_AGREEMENT_CANONICAL_TEXT = `Annexe de traitement des données
Version du 21 août 2026
Cette annexe fait partie des conditions du pilote et encadre les traitements réalisés par Kivli pour le compte du commerçant.

1. Parties et rôles
Le commerçant utilisant Kivli est le responsable du traitement des données de ses clients et employés. TAILEB Ouahid, éditeur de Kivli, est le sous-traitant pour l’hébergement et l’exploitation technique de ces données. Kivli reste responsable de ses traitements propres liés aux comptes, à la sécurité, au support et à l’administration du pilote.

2. Description du traitement
Objet : Fourniture d’une plateforme de fidélité digitale.
Durée : Durée du compte et période nécessaire à la restitution puis à la suppression.
Opérations : Collecte, normalisation, enregistrement, consultation, organisation, calcul des points, génération de QR codes, modification, export, limitation et suppression.
Finalités : Inscription aux programmes, gestion des cartes, passages ou achats, points, récompenses, historique, accès employés et, uniquement sur instruction valable, campagnes SMS futures.
Personnes : Clients du commerce, propriétaire et employés autorisés.
Données : Prénom, téléphone, consentement marketing et sa preuve, identifiant de carte, activité de fidélité, récompenses, historique ; identité et accès limités des employés.

3. Instructions documentées
Kivli traite les données uniquement pour fournir les fonctions activées par le commerçant, selon les présentes conditions et les actions effectuées dans l’interface. Toute demande supplémentaire doit être formulée par écrit. Kivli informe le commerçant si une instruction paraît contraire au RGPD ou au droit applicable, sauf interdiction légale.

4. Engagements de Kivli
Garantir la confidentialité des personnes autorisées ; mettre en œuvre les mesures de sécurité décrites ci-dessous ; aider le commerçant à répondre aux demandes d’accès, rectification, effacement, limitation, opposition et portabilité ; assister le commerçant pour la sécurité, les analyses nécessaires et les violations de données ; notifier toute violation concernant ses données dans les meilleurs délais après en avoir pris connaissance, avec les informations disponibles ; tenir à disposition les informations nécessaires pour démontrer la conformité et permettre un audit raisonnable, sans compromettre la sécurité d’autres utilisateurs ; supprimer ou restituer les données en fin de service selon le choix du commerçant, sauf obligation légale contraire.

5. Engagements du commerçant
Collecter et traiter les données de façon licite, loyale et transparente ; fournir aux clients les informations requises et définir des durées adaptées ; ne demander que les données nécessaires ; gérer les droits et vérifier l’identité du demandeur de façon proportionnée ; réserver la prospection SMS aux personnes ayant valablement consenti et respecter tout retrait ; sécuriser ses accès et ceux de ses employés ; documenter ses instructions et superviser le traitement.

6. Mesures de sécurité
HTTPS, contrôle d’accès par rôle, secrets hachés avec sel, cookies HTTP-only et sécurisés, limitation des tentatives, vérification d’e-mail, identifiants uniques, séparation des espaces, journalisation des opérations sensibles, restriction des employés, base D1 de juridiction européenne et procédures de suppression. Ces mesures évoluent selon les risques et l’état de l’art.

7. Sous-traitants ultérieurs et transferts
Le commerçant autorise de manière générale le recours à Cloudflare, Inc. pour Workers, D1, diffusion et sécurité, et à OVH SAS pour la messagerie Zimbra. La base D1 persiste dans l’Union européenne ; le réseau mondial de Cloudflare peut traiter des requêtes et métadonnées hors EEE selon son accord de traitement et ses garanties de transfert. OVHcloud héberge la messagerie Zimbra utilisée par Kivli en France.
Kivli informe les commerçants de tout ajout ou remplacement important au moins 30 jours avant sa prise d’effet lorsque cela est possible. Le commerçant peut présenter une objection motivée liée à la protection des données ; les parties cherchent alors une solution raisonnable.

8. Sort des données
À la fin du pilote, le commerçant peut demander une restitution dans un format structuré courant. Après restitution ou expiration du délai prévu, Kivli supprime les données opérationnelles et leurs copies contrôlées dans les 30 jours, sous réserve des sauvegardes à rotation limitée et des données qu’une obligation légale impose de conserver. Les données clients inactives sont supprimées au plus tard trois ans après leur dernière activité.

9. Exercice des droits et contact
Les demandes adressées directement à Kivli sont transmises au commerçant concerné. Kivli fournit l’assistance technique raisonnable nécessaire dans les délais permettant au commerçant de répondre sous un mois. Contact : contact@kivli.fr.`;

export function acceptedCheckbox(value: unknown) {
  return value === true || value === "on" || value === "true";
}

export function pilotDeclarationForBusiness(businessName: string) {
  return `Je confirme être habilité(e) à engager le commerce ${businessName} et j’accepte les Conditions du pilote Kivli ainsi que l’Accord relatif au traitement des données personnelles.`;
}

let proofPromise: Promise<{
  pilotTerms: { key: "pilot_terms"; version: string; title: string; content: string; sha256: string };
  dataProcessing: { key: "data_processing_agreement"; version: string; title: string; content: string; sha256: string };
}> | null = null;

export function currentPilotDocumentProofs() {
  if (!proofPromise) {
    proofPromise = Promise.all([
      sha256(PILOT_TERMS_CANONICAL_TEXT),
      sha256(DATA_PROCESSING_AGREEMENT_CANONICAL_TEXT),
    ]).then(([pilotTermsHash, dataProcessingHash]) => ({
      pilotTerms: { key: "pilot_terms" as const, version: PILOT_TERMS_VERSION, title: "Conditions du pilote gratuit", content: PILOT_TERMS_CANONICAL_TEXT, sha256: pilotTermsHash },
      dataProcessing: { key: "data_processing_agreement" as const, version: DATA_PROCESSING_AGREEMENT_VERSION, title: "Annexe de traitement des données", content: DATA_PROCESSING_AGREEMENT_CANONICAL_TEXT, sha256: dataProcessingHash },
    }));
  }
  return proofPromise;
}
