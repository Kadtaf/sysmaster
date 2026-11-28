import type { Metadata } from 'next';
import Link from 'next/link';
import { ERASURE_GRACE_DAYS, RETENTION_DAYS } from '@sysmaster/contracts';
import { Card, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Confidentialité et données personnelles' };

// Identité de l'éditeur : à renseigner au déploiement (docs/08 §RGPD). Tant qu'elle manque, la page le dit.
const editor = process.env.NEXT_PUBLIC_LEGAL_NAME ?? '[raison sociale et adresse de l’éditeur à renseigner]';
const contact = process.env.NEXT_PUBLIC_PRIVACY_CONTACT ?? '[adresse de contact RGPD à renseigner]';

const years = (days: number) => (days % 365 === 0 ? `${days / 365} an${days >= 730 ? 's' : ''}` : `${Math.round(days / 30)} mois`);

const retention: [string, string][] = [
  ['Compte, progression, labs, examens, certificats', 'Tant que le compte existe, puis effacement sur demande'],
  ['Conversations avec l’assistant', `${years(RETENTION_DAYS.assistantConversations)} sans nouveau message`],
  ['Sessions de diagnostic (descriptions, journaux collés)', years(RETENTION_DAYS.diagnosticSessions)],
  ['Commandes tapées dans les labs', `${years(RETENTION_DAYS.labTranscripts)} après la fin du lab`],
  ['Signaux d’intégrité des examens (changements d’onglet, collages)', `${years(RETENTION_DAYS.examIntegrity)} après l’examen`],
  ['Notifications lues', years(RETENTION_DAYS.readNotifications)],
  ['Trace des e-mails de notification envoyés', years(RETENTION_DAYS.notificationEmails)],
  ['Journal d’audit (publications, révocations, actions d’administration)', years(RETENTION_DAYS.auditLog)],
  ['Factures et achats d’examens (pièces comptables)', `${years(RETENTION_DAYS.billingRecords)}, même après la suppression du compte`],
];

export default function PrivacyPage() {
  return (
    <article className="prose-sm max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold">Confidentialité et données personnelles</h1>
      <p className="text-muted-foreground">
        Cette page explique quelles données SysMaster traite, pourquoi, combien de temps, et comment exercer vos droits
        (règlement général sur la protection des données, RGPD).
      </p>

      <Card>
        <CardTitle>Responsable du traitement</CardTitle>
        <p className="mt-2 text-sm">{editor}</p>
        <p className="mt-1 text-sm">Contact pour toute question sur vos données : {contact}</p>
      </Card>

      <Card>
        <CardTitle>Données traitées et finalités</CardTitle>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm">
          <li><strong>Compte</strong> (e-mail, nom affiché, rôles) : vous identifier et sécuriser l’accès. Base légale : exécution du service.</li>
          <li><strong>Apprentissage</strong> (parcours, leçons, quiz, labs, examens, certificats) : suivre votre progression et délivrer des certificats vérifiables. Base légale : exécution du service.</li>
          <li><strong>Assistant et diagnostic</strong> (questions, descriptions, journaux collés) : vous répondre. Ne collez pas de mots de passe ni de données de tiers. Base légale : exécution du service.</li>
          <li><strong>Communauté</strong> (sujets, réponses, messages de groupe et de mentorat, signalements) : permettre l’entraide et la modérer. Base légale : exécution du service et intérêt légitime (modération).</li>
          <li><strong>Paiement</strong> (offre souscrite, factures, examens achetés, montants) : encaisser et tenir la comptabilité. Base légale : exécution du contrat et obligation légale (conservation des pièces comptables).</li>
          <li><strong>Sécurité</strong> (journal d’audit, signaux d’intégrité des examens) : prévenir la fraude et les abus. Base légale : intérêt légitime.</li>
        </ul>
        <p className="mt-3 text-sm">
          Vos données ne sont ni vendues ni utilisées pour entraîner un modèle d’intelligence artificielle.
        </p>
      </Card>

      <Card>
        <CardTitle>Destinataires et sous-traitants</CardTitle>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm">
          <li>L’authentification est assurée par notre propre serveur Keycloak.</li>
          <li>
            Les e-mails de notification passent par notre prestataire d’envoi, qui reçoit votre adresse et le texte court de la
            notification, rien d’autre. Chaque e-mail contient un lien pour ne plus recevoir ce type d’e-mail.
          </li>
          <li>
            Quand l’assistant utilise un modèle d’IA externe (Anthropic, Claude), le texte de votre question et les extraits de
            documentation utiles lui sont transmis, sans votre nom ni votre e-mail. Anthropic peut traiter ces données hors de
            l’Union européenne, dans le cadre de clauses contractuelles types.
          </li>
          <li>
            Le paiement passe par Stripe, qui recueille vos coordonnées de paiement : SysMaster ne voit jamais votre numéro de
            carte et ne transmet à Stripe que l’identifiant interne de votre compte. Stripe peut traiter ces données hors de
            l’Union européenne, dans le cadre de clauses contractuelles types, et conserve ses propres obligations comptables.
          </li>
        </ul>
      </Card>

      <Card>
        <CardTitle>Durées de conservation</CardTitle>
        <table className="mt-3 w-full text-left text-sm">
          <tbody>
            {retention.map(([what, how]) => (
              <tr key={what} className="border-t">
                <td className="py-2 pr-4">{what}</td>
                <td className="py-2 text-muted-foreground">{how}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-sm text-muted-foreground">Ces durées sont appliquées automatiquement, chaque heure.</p>
      </Card>

      <Card>
        <CardTitle>Vos droits</CardTitle>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm">
          <li>
            <strong>Accès et portabilité</strong> : téléchargez toutes vos données en un fichier depuis{' '}
            <Link href="/compte" className="link">Mon compte</Link>.
          </li>
          <li>
            <strong>Effacement</strong> : demandez la suppression depuis Mon compte. Elle est exécutée {ERASURE_GRACE_DAYS} jours plus
            tard, et vous pouvez l’annuler d’ici là. Vos sujets et réponses publics restent, signés « Compte supprimé », pour ne pas
            casser les discussions ; écrivez-nous avant si vous voulez qu’ils soient retirés eux aussi. Un abonnement en cours est
            résilié ce jour-là, une tentative d’examen payée mais pas utilisée est remboursée, et les factures sont gardées le
            temps imposé par la loi.
          </li>
          <li><strong>Rectification</strong> : votre nom et votre e-mail se modifient dans l’espace sécurité du compte.</li>
          <li><strong>Opposition, limitation, questions</strong> : écrivez à {contact}.</li>
          <li>
            <strong>Réclamation</strong> : vous pouvez saisir la CNIL (
            <a href="https://www.cnil.fr/fr/plaintes" className="link" rel="noopener noreferrer">cnil.fr/fr/plaintes</a>).
          </li>
        </ul>
      </Card>

      <Card>
        <CardTitle>Cookies</CardTitle>
        <p className="mt-2 text-sm">
          SysMaster n’utilise que les cookies strictement nécessaires à la connexion (session et protection contre la
          falsification de requêtes). Aucun cookie de mesure d’audience ni de publicité : aucun consentement n’est donc
          demandé.
        </p>
      </Card>
    </article>
  );
}
