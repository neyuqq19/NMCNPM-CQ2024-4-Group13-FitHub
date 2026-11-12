import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { APPOINTMENT_SOURCE, DatabaseAppointmentSource } from "./appointment-source";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { PUSH_ADAPTER, SimulatedPushAdapter } from "./push.adapter";

// UC05 (membership) and UC08 (PT booking) import this module and call the schedule* methods.
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    { provide: PUSH_ADAPTER, useClass: SimulatedPushAdapter },
    { provide: APPOINTMENT_SOURCE, useClass: DatabaseAppointmentSource },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
