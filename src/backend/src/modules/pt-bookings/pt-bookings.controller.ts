import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { PtBookingsService } from "./pt-bookings.service";

@Controller("api/appointments")
export class PtBookingsController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PtBookingsService) private readonly bookings: PtBookingsService,
  ) {}

  @Post()
  async book(@Headers("authorization") h: string, @Body() body: Record<string, unknown> | undefined) {
    return this.bookings.book(await this.auth.validateSession(h), body);
  }

  // Khai báo "my" trước ":id" để không bị nuốt thành tham số.
  @Get("my")
  async mine(@Headers("authorization") h: string) {
    return this.bookings.listMine(await this.auth.validateSession(h));
  }

  @Get()
  async list(
    @Headers("authorization") h: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.bookings.list(await this.auth.validateSession(h), query);
  }

  @Post(":id/cancel-by-member")
  @HttpCode(200)
  async cancelByMember(@Headers("authorization") h: string, @Param("id") id: string) {
    return this.bookings.cancelByMember(await this.auth.validateSession(h), id);
  }

  @Post(":id/cancel-by-pt")
  @HttpCode(200)
  async cancelByPt(
    @Headers("authorization") h: string,
    @Param("id") id: string,
    @Body() body: Record<string, unknown> | undefined,
  ) {
    return this.bookings.cancelByPt(await this.auth.validateSession(h), id, body);
  }

  @Post(":id/verify-no-show")
  @HttpCode(200)
  async verifyNoShow(@Headers("authorization") h: string, @Param("id") id: string) {
    return this.bookings.verifyNoShow(await this.auth.validateSession(h), id);
  }
}
