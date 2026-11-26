import { BadRequestException, ConflictException, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import type { PrivacyStatusDto } from '@sysmaster/contracts';
import { canCancelErasure, ERASURE_CONFIRMATION, ERASURE_GRACE_DAYS, erasureDueAt, erasureRequestBlocker, RETENTION_DAYS } from '../domain/privacy';
import { IdentityAdmin, PrivacyRepository } from './ports';

@Injectable()
export class PrivacyService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PrivacyService.name);
  private timer?: NodeJS.Timeout;
  private running: Promise<unknown> | null = null;

  constructor(
    private readonly repo: PrivacyRepository,
    private readonly idp: IdentityAdmin,
  ) {}

  /** Tâche périodique : effacements arrivés à échéance, puis durées de conservation. */
  onApplicationBootstrap() {
    const interval = Number(process.env.PRIVACY_JOB_INTERVAL_MS ?? 3_600_000);
    if (interval > 0) {
      this.timer = setInterval(() => void this.runJobs().catch((e) => this.logger.error(e)), interval);
      this.timer.unref();
    }
  }

  async onApplicationShutdown() {
    clearInterval(this.timer);
    await this.running;
  }

  runJobs(now = new Date()) {
    if (!this.running) {
      this.running = (async () => {
        const erased = await this.eraseDue(now);
        await this.repo.retryIdentityDeletion((subject) => this.idp.deleteUser(subject));
        const retention = await this.repo.applyRetention(now);
        const purged = Object.entries(retention).filter(([, n]) => n > 0);
        if (erased || purged.length) this.logger.log(`RGPD : ${erased} compte(s) effacé(s) ; conservation : ${JSON.stringify(Object.fromEntries(purged))}`);
        return { erased, retention };
      })().finally(() => (this.running = null));
    }
    return this.running;
  }

  eraseDue(now = new Date()) {
    return this.repo.erase(now, 100, (subject) => this.idp.deleteUser(subject));
  }

  async status(userId: string, now = new Date()): Promise<PrivacyStatusDto> {
    const s = await this.repo.state(userId);
    return {
      erasure: s.status === 'scheduled'
        ? { status: 'scheduled', requestedAt: s.requestedAt.toISOString(), dueAt: s.dueAt.toISOString(), cancellable: canCancelErasure(s, now) }
        : { status: 'none' },
      graceDays: ERASURE_GRACE_DAYS,
      confirmation: ERASURE_CONFIRMATION,
      retentionDays: { ...RETENTION_DAYS },
    };
  }

  async exportData(userId: string, now = new Date()) {
    return {
      format: 'sysmaster-export/1',
      exportedAt: now.toISOString(),
      notice:
        'Toutes les données personnelles que SysMaster conserve sur vous. Les contenus publics des autres membres et leurs noms n’y figurent pas.',
      data: await this.repo.exportData(userId),
    };
  }

  async requestErasure(userId: string, confirmation: string | undefined, now = new Date()) {
    const blocker = erasureRequestBlocker(await this.repo.state(userId), confirmation);
    if (blocker) throw (blocker.includes('saisissez') ? new BadRequestException(blocker) : new ConflictException(blocker));
    if (!(await this.repo.scheduleErasure(userId, now, erasureDueAt(now)))) throw new ConflictException('Une demande de suppression est déjà en cours.');
    return this.status(userId, now);
  }

  async cancelErasure(userId: string, now = new Date()) {
    if (!(await this.repo.cancelErasure(userId))) throw new ConflictException('Aucune demande de suppression annulable.');
    return this.status(userId, now);
  }
}
