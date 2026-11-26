import { Controller, Get, Headers, HttpCode, Post, Body, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CheckoutSchema, type BillingCatalogDto, type BillingStatusDto, type RedirectDto } from '@sysmaster/contracts';
import { parse } from '../../editorial/application/editorial.service';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { CurrentUser, Public } from '../../iam/interface/auth.decorators';
import { BillingService } from '../application/billing.service';

@ApiTags('billing')
@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Public()
  @Get('billing/plans')
  @ApiOperation({ summary: 'Offres et prix ; enabled=false tant que le paiement n’est pas configuré' })
  plans(): Promise<BillingCatalogDto> {
    return this.billing.catalog();
  }

  @ApiBearerAuth()
  @Get('me/billing')
  @ApiOperation({ summary: 'Mon offre, mon abonnement, mes factures' })
  status(@CurrentUser() user: AuthenticatedUser): Promise<BillingStatusDto> {
    return this.billing.status(user.id);
  }

  @ApiBearerAuth()
  @Post('me/billing/checkout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Page de paiement Stripe pour { plan: premium | pro } ; 409 si un abonnement existe déjà, 503 si le paiement est fermé' })
  checkout(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<RedirectDto> {
    return this.billing.checkout(user.id, parse(CheckoutSchema, body ?? {}));
  }

  @ApiBearerAuth()
  @Post('me/billing/portal')
  @HttpCode(200)
  @ApiOperation({ summary: 'Portail Stripe : changer de carte ou d’offre, résilier, télécharger les factures' })
  portal(@CurrentUser() user: AuthenticatedUser): Promise<RedirectDto> {
    return this.billing.portal(user.id);
  }

  /** Appelé par Stripe seulement : la signature (Stripe-Signature) authentifie l'appel, pas un jeton. */
  @Public()
  @Post('billing/webhook')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  webhook(@Req() req: { rawBody?: Buffer }, @Headers('stripe-signature') signature?: string) {
    return this.billing.webhook(req.rawBody, signature);
  }
}
