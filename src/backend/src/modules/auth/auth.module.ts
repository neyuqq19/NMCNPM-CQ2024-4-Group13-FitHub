import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { RegistrationController } from "./registration.controller";
import { RegistrationService } from "./registration.service";
import { OtpMailer } from "./otp-mailer";
import { DatabaseModule } from "../../database/database.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Module({
  imports: [
    DatabaseModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
  ],
  controllers: [AuthController, RegistrationController],
  providers: [AuthService, RegistrationService, OtpMailer],
  exports: [AuthService],
})
export class AuthModule {}
