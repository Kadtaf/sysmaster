import type { LabCategory, LabSummaryDto, LabTranscriptEntry, Difficulty } from '@sysmaster/contracts';
import type { SimulationSpec } from '../domain/lab';
import type { MachineState } from '../domain/machine';

export interface LabTemplate extends LabSummaryDto {
  id: string;
  category: LabCategory;
  difficulty: Difficulty;
  briefMd: string;
  hints: string[];
  solutionMd: string | null;
  simulation: SimulationSpec | null;
}

export interface LabInstance {
  id: string;
  templateId: string;
  userId: string;
  status: 'running' | 'solved' | 'expired';
  state: MachineState;
  transcript: LabTranscriptEntry[];
  commandCount: number;
  hintsUsed: number;
  score: number | null;
  expiresAt: Date;
}

/** Port de persistance des labs (Postgres en production, mémoire possible en test). */
export abstract class LabRepository {
  abstract list(): Promise<LabSummaryDto[]>;
  abstract find(slug: string): Promise<LabTemplate | null>;
  abstract findById(templateId: string): Promise<LabTemplate | null>;
  /** Instance encore ouverte de cet apprenant pour ce lab (les expirées sont closes au passage). */
  abstract active(userId: string, templateId: string): Promise<LabInstance | null>;
  abstract create(userId: string, template: LabTemplate): Promise<LabInstance>;
  abstract get(id: string): Promise<LabInstance | null>;
  /**
   * Enregistre une commande. Écriture optimiste : renvoie false si une autre commande est
   * passée entre-temps (`expectedCount` ne correspond plus).
   */
  abstract saveCommand(id: string, expectedCount: number, state: MachineState, transcript: LabTranscriptEntry[]): Promise<boolean>;
  abstract useHint(id: string): Promise<number>;
  /** Passe l'instance à « résolue » et publie `labs.lab.solved.v1` dans la même transaction. */
  abstract solve(instance: LabInstance, labSlug: string, score: number): Promise<boolean>;
  abstract close(id: string): Promise<void>;
}
