import { timingSafeEqual } from "node:crypto";
import { type CanActivate, type ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { CONTAINER, type Container } from "./container";

/**
 * Yönetim API'si için geçici koruma: `Authorization: Bearer <ADMIN_API_TOKEN>`.
 * Panel girişi (kullanıcı + şifre + session) geldiğinde bununla değiştirilecek.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly expected: Buffer;

  constructor(@Inject(CONTAINER) container: Container) {
    this.expected = Buffer.from(container.env.ADMIN_API_TOKEN);
  }

  canActivate(context: ExecutionContext): boolean {
    const header = context.switchToHttp().getRequest<Request>().headers.authorization ?? "";
    const given = Buffer.from(header.startsWith("Bearer ") ? header.slice(7) : "");
    if (given.length !== this.expected.length || !timingSafeEqual(given, this.expected)) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
