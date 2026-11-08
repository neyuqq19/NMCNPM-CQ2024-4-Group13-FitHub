import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";

@Controller("api")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post("auth/login")
  @UseGuards(ThrottlerGuard)
  @HttpCode(200)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get("auth/me")
  async getMe(@Headers("authorization") authHeader?: string) {
    return this.authService.validateSession(authHeader);
  }

  @Get("auth/membership")
  async membership(@Headers("authorization") header?: string) {
    const user = await this.authService.validateSession(header);
    return this.authService.getMyMembershipSummary(user.id);
  }

  @Post("auth/logout")
  @HttpCode(200)
  async logout(@Headers("authorization") header?: string) {
    return this.authService.logout(header);
  }
}
