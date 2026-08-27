import type { Metadata } from "next";
import { LegalPage, LegalSection } from "../../components/LegalPage";

export const metadata: Metadata = { title: "Mentions légales", description: "Informations légales relatives à l’édition et à l’hébergement de Kivli.", robots: { index: true, follow: true } };

export default function MentionsLegalesPage() {
  return <LegalPage eyebrow="Informations légales" title="Mentions légales" intro="Les informations permettant d’identifier l’éditeur actuel de Kivli et les prestataires qui assurent son fonctionnement.">
    <LegalSection title="Éditeur du service">
      <dl className="legal-facts"><div><dt>Éditeur</dt><dd>TAILEB Ouahid, personne physique non immatriculée — phase pilote non commerciale</dd></div><div><dt>Adresse</dt><dd>2 rue Léonie, 28100 Dreux, France</dd></div><div><dt>Téléphone</dt><dd><a href="tel:+33641047766">06 41 04 77 66</a></dd></div><div><dt>E-mail</dt><dd><a href="mailto:contact@kivli.fr">contact@kivli.fr</a></dd></div></dl>
      <p>Kivli est actuellement proposé gratuitement dans le cadre d’une phase pilote de 60 jours, dont l’accès reste fonctionnel sans facturation automatique après l’échéance et peut être prolongé gratuitement. Aucun SIREN, capital social, numéro de TVA ou forme sociale n’est indiqué, l’activité n’étant pas encore exploitée par une structure immatriculée.</p>
    </LegalSection>
    <LegalSection title="Direction de la publication"><p>Directeur de la publication : TAILEB Ouahid.</p></LegalSection>
    <LegalSection title="Hébergement et infrastructure">
      <p>L’application et sa base de données sont hébergées par <strong>Cloudflare, Inc.</strong>, 101 Townsend Street, San Francisco, CA 94107, États-Unis — téléphone : +1 650 319 8930. La base Cloudflare D1 de Kivli utilise une juridiction européenne pour son stockage persistant.</p>
      <p>Le nom de domaine et la messagerie <code>@kivli.fr</code> sont fournis par <strong>OVH SAS</strong>, 2 rue Kellermann, 59100 Roubaix, France.</p>
    </LegalSection>
    <LegalSection title="Propriété intellectuelle"><p>Le nom Kivli, son identité visuelle, ses textes, interfaces et éléments graphiques sont protégés. Toute reproduction ou réutilisation substantielle sans autorisation écrite préalable est interdite, sous réserve des exceptions prévues par la loi.</p></LegalSection>
    <LegalSection title="Contact et signalement"><p>Pour une question juridique, un signalement ou une demande concernant le service : <a href="mailto:contact@kivli.fr">contact@kivli.fr</a>.</p></LegalSection>
  </LegalPage>;
}
