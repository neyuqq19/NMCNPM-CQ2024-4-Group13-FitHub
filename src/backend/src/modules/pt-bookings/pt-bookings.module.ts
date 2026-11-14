import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PtBookingsController } from "./pt-bookings.controller";
import { PtBookingsService } from "./pt-bookings.service";

@Module({
  imports: [DatabaseModule, AuthModule, NotificationsModule],
  controllers: [PtBookingsController],
  providers: [PtBookingsService],
  exports: [PtBookingsService],
})
export class PtBookingsModule {}
