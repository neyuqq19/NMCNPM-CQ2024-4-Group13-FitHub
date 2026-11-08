import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { RegisterDto, ResendOtpDto, VerifyEmailDto } from "./dto/register.dto";
import { RegistrationService } from "./registration.service";
@Controller("api/auth")
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60000 } })
export class RegistrationController {
  constructor(
    @Inject(RegistrationService)
    private readonly registration: RegistrationService,
  ) {}
  @Post("register") register(@Body() input: RegisterDto) {
    return this.registration.register(input);
  }
  @Post("resend-email-otp") resend(@Body() input: ResendOtpDto) {
    return this.registration.resend(input.verificationId);
  }
  @Post("verify-email") verify(@Body() input: VerifyEmailDto) {
    return this.registration.verify(input);
  }
}
