import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TokenVerifier, UserRepository } from './application/ports';
import { UserProvisioner } from './application/user-provisioner';
import { JoseTokenVerifier } from './infrastructure/jose-token-verifier';
import { PgUserRepository } from './infrastructure/pg-user.repository';
import { AuthGuard } from './interface/auth.guard';
import { MeController } from './interface/me.controller';

@Global()
@Module({
  controllers: [MeController],
  providers: [
    { provide: TokenVerifier, useFactory: () => JoseTokenVerifier.fromEnv() },
    { provide: UserRepository, useClass: PgUserRepository },
    UserProvisioner,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [TokenVerifier],
})
export class IamModule {}
