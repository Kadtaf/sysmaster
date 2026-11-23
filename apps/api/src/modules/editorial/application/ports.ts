import type { CommandContent, RevisionStatus, RevisionSummaryDto } from '@sysmaster/contracts';

export interface RevisionRecord {
  id: string;
  commandId: string | null;
  isNew: boolean;
  content: CommandContent;
  status: RevisionStatus;
  authorId: string;
  authorName: string;
  reviewerName: string | null;
  reviewComment: string | null;
  updatedAt: string;
  history: { action: string; actor: string; comment: string | null; at: string }[];
}

export type RevisionAction = 'created' | 'submitted' | 'changes_requested' | 'approved' | 'withdrawn';

export class OpenRevisionExistsError extends Error {}
export class SlugTakenError extends Error {}

export abstract class EditorialRepository {
  abstract list(filter: { status?: RevisionStatus; authorId?: string }): Promise<RevisionSummaryDto[]>;
  abstract find(id: string): Promise<RevisionRecord | null>;
  /** Fiche publiée, convertie en contenu éditable (pour en proposer une modification). */
  abstract publishedContent(slug: string): Promise<{ commandId: string; content: CommandContent } | null>;
  abstract publishedSlugs(): Promise<Set<string>>;
  /** @throws OpenRevisionExistsError si la fiche a déjà une révision ouverte */
  abstract create(authorId: string, commandId: string | null, content: CommandContent): Promise<string>;
  abstract saveContent(id: string, content: CommandContent): Promise<void>;
  abstract transition(id: string, to: RevisionStatus, actorId: string, action: RevisionAction, comment: string | null): Promise<void>;
  /**
   * Remplace (ou crée) la fiche publiée à partir de la révision, en une transaction, avec journal
   * d'audit et événement kb.command.published.v1.
   * @throws SlugTakenError si l'identifiant d'URL appartient déjà à une autre fiche
   */
  abstract publish(revision: RevisionRecord, reviewerId: string, comment: string | null): Promise<void>;
}
