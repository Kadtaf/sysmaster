import type {
  CertificateIssuedV1, CommunityAnswerAcceptedV1, CommunityMentorshipChangedV1, CommunityReplyPostedV1, EditorialRevisionReviewedV1, NotificationType,
} from '@sysmaster/contracts';

/** Notification à créer à partir d'un événement. Pur : aucune lecture en base. */
export interface PendingNotification {
  userId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  href: string;
}

/** Événements qui peuvent donner lieu à une notification. */
export const NOTIFYING_EVENTS = [
  'community.reply.posted.v1',
  'community.answer.accepted.v1',
  'community.mentorship.changed.v1',
  'assessment.certificate.issued.v1',
  'editorial.revision.reviewed.v1',
] as const;

const MENTORSHIP_TITLES: Record<CommunityMentorshipChangedV1['status'], string> = {
  requested: 'Nouvelle demande de mentorat',
  active: 'Votre demande de mentorat est acceptée',
  declined: 'Votre demande de mentorat n’a pas été retenue',
  ended: 'Un mentorat est terminé',
};

/** Titre de sujet tronqué : une notification reste courte. */
export function excerpt(text: string, max = 80): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Qui prévenir, et de quoi. Jamais la personne qui est à l'origine de l'événement : on ne se
 * notifie pas soi-même. Le texte ne reprend que des informations que le destinataire voit déjà
 * sur la page liée (titre public d'un sujet, sujet d'un mentorat), jamais le contenu d'un message.
 */
export function notificationFor(type: string, payload: unknown): PendingNotification | null {
  switch (type) {
    case 'community.reply.posted.v1': {
      const p = payload as CommunityReplyPostedV1;
      if (p.authorId === p.threadAuthorId) return null;
      return {
        userId: p.threadAuthorId, type: 'community_reply', title: 'Nouvelle réponse à votre sujet',
        body: `« ${excerpt(p.threadTitle)} »`, href: `/communaute/${p.threadId}#post-${p.postId}`,
      };
    }
    case 'community.answer.accepted.v1': {
      const p = payload as CommunityAnswerAcceptedV1;
      if (p.userId === p.acceptedBy) return null;
      return { userId: p.userId, type: 'answer_accepted', title: 'Votre réponse a été acceptée', body: '+25 XP d’entraide.', href: `/communaute/${p.threadId}#post-${p.postId}` };
    }
    case 'community.mentorship.changed.v1': {
      const p = payload as CommunityMentorshipChangedV1;
      const userId = p.actorId === p.mentorId ? p.menteeId : p.mentorId;
      if (userId === p.actorId) return null;
      return { userId, type: 'mentorship', title: MENTORSHIP_TITLES[p.status], body: `Sujet : ${excerpt(p.topic)}`, href: `/communaute/mentorat/${p.mentorshipId}` };
    }
    case 'assessment.certificate.issued.v1': {
      const p = payload as CertificateIssuedV1;
      return {
        userId: p.userId, type: 'certificate_issued', title: `Certification ${p.certificationCode} obtenue`,
        body: `Score : ${p.score} %. Votre certificat est vérifiable publiquement.`, href: `/verify/${encodeURIComponent(p.serial)}`,
      };
    }
    case 'editorial.revision.reviewed.v1': {
      const p = payload as EditorialRevisionReviewedV1;
      if (p.authorId === p.reviewerId) return null;
      return p.decision === 'approved'
        ? { userId: p.authorId, type: 'editorial_review', title: 'Votre contribution est publiée', body: null, href: `/editorial/${p.revisionId}` }
        : { userId: p.authorId, type: 'editorial_review', title: 'Des modifications sont demandées sur votre contribution', body: 'Le commentaire du relecteur est sur la page.', href: `/editorial/${p.revisionId}` };
    }
    default:
      return null;
  }
}

/** Seuls les chemins internes sont des liens acceptés (pas de redirection vers un autre site). */
export function safeHref(href: unknown): string | null {
  return typeof href === 'string' && /^\/(?!\/)[^\s\\]*$/.test(href) ? href : null;
}
