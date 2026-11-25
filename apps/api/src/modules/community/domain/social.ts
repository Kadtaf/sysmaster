/**
 * Règles du mentorat et des groupes d'étude (docs/03 §2.9). Pures.
 * Principes : la mise en relation est encadrée (seuls les mentors déclarés reçoivent des demandes,
 * un mentor ne suit pas plus d'apprenants qu'il ne l'a choisi), et les échanges privés ne sont lus
 * que par les personnes concernées.
 */
import { hasAnyRole, type AuthenticatedUser } from '../../iam/domain/identity';

/** Demandes de mentorat en attente qu'un apprenant peut avoir en même temps. */
export const MAX_OPEN_REQUESTS = 3;
/** Groupes qu'une personne peut créer. */
export const MAX_OWNED_GROUPS = 5;
/** Messages par heure dans un groupe ou un binôme (anti-spam). */
export const MAX_MESSAGES_PER_HOUR = 60;

export type MentorshipStatus = 'requested' | 'active' | 'ended' | 'declined';
export type MentorshipAction = 'accept' | 'decline' | 'end';

export function canMentor(user: Pick<AuthenticatedUser, 'roles'>): boolean {
  return hasAnyRole(user, ['mentor', 'admin']);
}

/** Raison pour laquelle on ne peut pas demander ce mentor, ou null. */
export function requestBlocker(input: {
  self: boolean;
  mentor: { accepting: boolean; activeMentees: number; maxMentees: number } | null;
  openRequests: number;
  alreadyOpen: boolean;
}): string | null {
  if (!input.mentor) return 'Ce mentor n’existe pas ou ne propose plus de mentorat.';
  if (input.self) return 'Vous ne pouvez pas être votre propre mentor.';
  if (input.alreadyOpen) return 'Une demande ou un mentorat est déjà en cours avec cette personne.';
  if (!input.mentor.accepting) return 'Ce mentor ne prend pas de nouvel apprenant pour le moment.';
  if (input.mentor.activeMentees >= input.mentor.maxMentees) return 'Ce mentor suit déjà autant d’apprenants qu’il le souhaite.';
  if (input.openRequests >= MAX_OPEN_REQUESTS) return `Vous avez déjà ${MAX_OPEN_REQUESTS} demandes en attente : attendez une réponse avant d’en envoyer d’autres.`;
  return null;
}

/**
 * Transition d'un mentorat : statut suivant, ou raison du refus. Le mentor accepte ou refuse une
 * demande ; l'un ou l'autre met fin à un mentorat actif ; l'apprenant peut retirer sa demande.
 */
export function transition(
  status: MentorshipStatus,
  action: MentorshipAction,
  actor: 'mentor' | 'mentee',
  capacity: { activeMentees: number; maxMentees: number },
): { next: MentorshipStatus } | { error: string } {
  if (action === 'accept') {
    if (actor !== 'mentor') return { error: 'Seul le mentor accepte une demande.' };
    if (status !== 'requested') return { error: 'Cette demande n’est plus en attente.' };
    if (capacity.activeMentees >= capacity.maxMentees) return { error: 'Vous suivez déjà le nombre d’apprenants indiqué dans votre profil.' };
    return { next: 'active' };
  }
  if (action === 'decline') {
    if (status !== 'requested') return { error: 'Cette demande n’est plus en attente.' };
    // Refus par le mentor, retrait par l'apprenant : même issue.
    return { next: 'declined' };
  }
  if (status !== 'active') return { error: 'Ce mentorat n’est pas en cours.' };
  return { next: 'ended' };
}

/** Qui lit et écrit les messages d'un mentorat : les deux personnes, tant qu'il est actif (lecture ensuite). */
export function mentorshipAccess(status: MentorshipStatus): { read: boolean; write: boolean } {
  return { read: status !== 'declined', write: status === 'active' };
}

/** Raison pour laquelle on ne peut pas rejoindre ce groupe, ou null. */
export function joinBlocker(g: { isPublic: boolean; memberCount: number; maxMembers: number; isMember: boolean }, withCode: boolean): string | null {
  if (g.isMember) return 'Vous faites déjà partie de ce groupe.';
  if (!g.isPublic && !withCode) return 'Ce groupe est privé : il faut un code d’invitation.';
  if (g.memberCount >= g.maxMembers) return 'Ce groupe est complet.';
  return null;
}

/**
 * Responsable suivant quand le responsable quitte le groupe : le membre le plus ancien.
 * null : plus personne, le groupe est fermé.
 */
export function nextOwner(members: { userId: string; role: 'owner' | 'member'; joinedAt: Date }[], leaving: string): string | null {
  const rest = members.filter((m) => m.userId !== leaving).sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
  return rest[0]?.userId ?? null;
}

/** Code d'invitation lisible (sans 0/O/1/I), à partir d'octets aléatoires. */
export function inviteCode(bytes: Uint8Array): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from(bytes.slice(0, 8), (b) => alphabet[b % alphabet.length]).join('');
}
