import { Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}

export interface MailSettings {
  smtpUrl?: string;
  from?: string;
  linkSecret?: string;
}

/**
 * Envoi par SMTP (n'importe quel fournisseur : Brevo, Mailjet, Scaleway, Postmark, serveur interne…).
 * Fermé tant que SMTP_URL, MAIL_FROM et MAIL_LINK_SECRET ne sont pas tous fournis : aucune
 * notification par e-mail n'est alors préparée, rien ne s'accumule.
 */
@Injectable()
export class Mailer {
  private readonly logger = new Logger(Mailer.name);
  readonly enabled: boolean;
  private readonly transport: Transporter | null;

  constructor(private readonly settings: MailSettings) {
    this.enabled = Boolean(settings.smtpUrl && settings.from && (settings.linkSecret ?? '').length >= 32);
    this.transport = this.enabled ? createTransport(settings.smtpUrl!) : null;
    if (!this.enabled) this.logger.log('E-mails désactivés : SMTP_URL, MAIL_FROM ou MAIL_LINK_SECRET absents.');
  }

  static fromEnv(env = process.env) {
    return new Mailer({ smtpUrl: env.SMTP_URL, from: env.MAIL_FROM, linkSecret: env.MAIL_LINK_SECRET });
  }

  get linkSecret(): string {
    return this.settings.linkSecret ?? '';
  }

  async send(m: OutgoingEmail): Promise<void> {
    if (!this.transport) throw new Error('E-mails désactivés.');
    await this.transport.sendMail({ from: this.settings.from, to: m.to, subject: m.subject, text: m.text, html: m.html, headers: m.headers });
  }
}
