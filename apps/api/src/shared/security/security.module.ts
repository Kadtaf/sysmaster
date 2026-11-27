import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { RateLimitInterceptor } from './rate-limit';

@Module({ providers: [{ provide: APP_INTERCEPTOR, useClass: RateLimitInterceptor }] })
export class SecurityModule {}
