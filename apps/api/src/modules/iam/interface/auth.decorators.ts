import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthenticatedUser, GlobalRole } from '../domain/identity';

export const AUTH_MODE = 'sysmaster:auth-mode';
export const REQUIRED_ROLES = 'sysmaster:roles';

/**
 * Par défaut, toute route exige une connexion (« fermé par défaut »).
 *  - @Public()       : accessible sans jeton ; un jeton fourni est ignoré s'il est absent, refusé s'il est invalide.
 *  - @OptionalAuth() : accessible sans jeton, mais l'utilisateur est identifié s'il en fournit un.
 *  - @Roles(...)     : connexion obligatoire et au moins un des rôles.
 */
export const Public = () => SetMetadata(AUTH_MODE, 'public');
export const OptionalAuth = () => SetMetadata(AUTH_MODE, 'optional');
export const Roles = (...roles: GlobalRole[]) => SetMetadata(REQUIRED_ROLES, roles);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedUser | null => ctx.switchToHttp().getRequest().user ?? null,
);
