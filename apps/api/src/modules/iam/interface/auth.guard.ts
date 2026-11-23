import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InvalidTokenError, TokenVerifier } from '../application/ports';
import { UserProvisioner } from '../application/user-provisioner';
import { GlobalRole, hasAnyRole } from '../domain/identity';
import { AUTH_MODE, REQUIRED_ROLES } from './auth.decorators';

/** Garde globale : authentification (jeton Keycloak) puis autorisation (rôles). */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifier,
    private readonly provisioner: UserProvisioner,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const mode = this.reflector.getAllAndOverride<'public' | 'optional' | undefined>(AUTH_MODE, targets);
    const roles = this.reflector.getAllAndOverride<GlobalRole[] | undefined>(REQUIRED_ROLES, targets) ?? [];
    const req = ctx.switchToHttp().getRequest();

    const header: string | undefined = req.headers?.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;

    if (!token) {
      if ((mode === 'public' || mode === 'optional') && roles.length === 0) return true;
      throw new UnauthorizedException('Connexion requise');
    }

    let claims;
    try {
      claims = await this.verifier.verify(token);
    } catch (err) {
      if (err instanceof InvalidTokenError) throw new UnauthorizedException('Jeton invalide ou expiré');
      this.logger.error(`Vérification du jeton impossible : ${(err as Error).message}`);
      throw new ServiceUnavailableException('Service d\'identité indisponible');
    }

    req.user = await this.provisioner.fromClaims(claims);
    if (!hasAnyRole(req.user, roles)) throw new ForbiddenException('Droits insuffisants');
    return true;
  }
}
