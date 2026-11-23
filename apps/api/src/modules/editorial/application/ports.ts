import type { ContentIssue, ContentKind, RevisionStatus, RevisionSummaryDto, SimulationDto } from '@sysmaster/contracts';
import type { PoolClient } from 'pg';

export interface RevisionRecord {
  id: string;
  kind: ContentKind;
  /** Contenu publié visé (uuid, ou code d'une cause) ; null pour un nouveau contenu pas encore publié. */
  targetId: string | null;
  isNew: boolean;
  content: unknown;
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
/** L'identifiant d'URL (ou le code) appartient déjà à un autre contenu. */
export class KeyTakenError extends Error {}

/** Forme minimale d'un schéma zod (le paquet zod est une dépendance des contrats, pas de l'API). */
export interface Schema<T> {
  safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: { path: (string | number)[]; message: string }[] } };
}

/**
 * Ce qui varie d'un type de contenu à l'autre. Le workflow, lui, est commun (domain/workflow.ts).
 * Chaque adaptateur lit et écrit le schéma de son contexte (kb, learning, diagnostic).
 */
export interface ContentKindAdapter<C = unknown> {
  readonly kind: ContentKind;
  readonly schema: Schema<C>;
  /** Nom affiché dans l'interface (« fiche », « cours »…). */
  readonly noun: string;
  blank(): C;
  key(content: C): string;
  title(content: C): string;
  /** Contenu publié converti en contenu éditable. */
  published(key: string): Promise<{ targetId: string; content: C } | null>;
  /** Écarts aux règles de publication, avec le contexte nécessaire (fiches, compétences, symptômes…). */
  issues(content: C, targetId: string | null): Promise<ContentIssue[]>;
  /** Écrit le contenu publié dans la transaction et renvoie l'identifiant de la cible. @throws KeyTakenError */
  apply(tx: PoolClient, content: C, targetId: string | null): Promise<string>;
  /** Type d'événement publié (outbox). */
  readonly publishedEvent: string;
  /** Simulation avant publication (causes de diagnostic). */
  simulate?(content: C): Promise<SimulationDto>;
}

export const CONTENT_KIND_ADAPTERS = Symbol('CONTENT_KIND_ADAPTERS');

export abstract class RevisionRepository {
  abstract list(filter: { status?: RevisionStatus; kind?: ContentKind; authorId?: string }): Promise<RevisionSummaryDto[]>;
  abstract find(id: string): Promise<RevisionRecord | null>;
  /** @throws OpenRevisionExistsError si la cible a déjà une révision ouverte */
  abstract create(kind: ContentKind, authorId: string, targetId: string | null, content: unknown): Promise<string>;
  abstract saveContent(id: string, content: unknown): Promise<void>;
  abstract transition(id: string, to: RevisionStatus, actorId: string, action: RevisionAction, comment: string | null): Promise<void>;
  /**
   * Publie en une transaction : `apply` écrit le contenu, puis la révision est marquée publiée,
   * avec historique, journal d'audit et événement outbox.
   */
  abstract publish(
    revision: RevisionRecord,
    reviewerId: string,
    comment: string | null,
    adapter: Pick<ContentKindAdapter, 'apply' | 'publishedEvent' | 'key'>,
  ): Promise<void>;
}
