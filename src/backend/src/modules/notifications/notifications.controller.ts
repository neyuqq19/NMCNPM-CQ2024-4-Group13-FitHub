import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import type { DispatchDueRequest, RegisterPushDeviceRequest } from "@fithub/contracts";
import { AuthService } from "../auth/auth.service";
import { NotificationsService } from "./notifications.service";

// UC16 — Hộp thư thông báo. Every route needs a valid session; scoping is done per user.
@Controller("api/notifications")
export class NotificationsController {
  constructor(
    @Inject(NotificationsService) private readonly service: NotificationsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get("my")
  @Header("Cache-Control", "no-store")
  async listMine(
    @Headers("authorization") header?: string,
    @Query() query: Record<string, string> = {},
  ) {
    return this.service.listMine(await this.auth.validateSession(header), query);
  }

  // Declared before ":id/read" so "read-all" is never taken for an id.
  @Post("read-all")
  @HttpCode(200)
  async readAll(@Headers("authorization") header?: string) {
    return this.service.markAllRead(await this.auth.validateSession(header));
  }

  @Post("dispatch-due")
  @HttpCode(200)
  async dispatchDue(
    @Body() body: DispatchDueRequest | undefined,
    @Headers("authorization") header?: string,
  ) {
    return this.service.dispatchDue(await this.auth.validateSession(header), body);
  }

  @Post("devices")
  @HttpCode(200)
  async registerDevice(
    @Body() body: Partial<RegisterPushDeviceRequest> | undefined,
    @Headers("authorization") header?: string,
  ) {
    return this.service.registerDevice(await this.auth.validateSession(header), body);
  }

  @Patch(":id/read")
  async markRead(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Headers("authorization") header?: string,
  ) {
    return this.service.markRead(await this.auth.validateSession(header), id);
  }
}
