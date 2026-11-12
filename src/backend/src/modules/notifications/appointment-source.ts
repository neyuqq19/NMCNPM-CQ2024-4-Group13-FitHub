import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";

// BR03 needs to ask "is this appointment still CONFIRMED?". The booking module (UC08)
// owns that answer, so UC16 only depends on this small contract.
export const APPOINTMENT_SOURCE = Symbol("APPOINTMENT_SOURCE");
export interface AppointmentSource {
  isConfirmed(appointmentId: string): Promise<boolean>;
}

/**
 * Default until UC08 lands: if there is no Appointment table yet, nothing can have
 * been cancelled, so reminders stay valid; the booking module cancels them through
 * cancelRemindersBySource. Once the table exists, its status decides.
 */
@Injectable()
export class DatabaseAppointmentSource implements AppointmentSource {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  async isConfirmed(appointmentId: string) {
    const table = await this.prisma.$queryRaw<{ t: string | null }[]>`
      SELECT to_regclass('"Appointment"')::text AS t`;
    if (!table[0]?.t) return true;
    const rows = await this.prisma.$queryRawUnsafe<{ status: string }[]>(
      `SELECT "status"::text AS status FROM "Appointment" WHERE "id" = $1::uuid`,
      appointmentId,
    );
    return rows[0]?.status === "CONFIRMED";
  }
}
