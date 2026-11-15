import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type {
  AppointmentActionResponse,
  AppointmentDto,
  AppointmentPageDto,
  AppointmentStatus,
  CurrentUser,
  PtSessionOutcome,
} from "@fithub/contracts";
import { PrismaService } from "../../database/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import {
  canVerifyNoShow,
  memberCancelOutcome,
  ptCancelOutcome,
} from "./pt-bookings.rules";

type Tx = Prisma.TransactionClient;

const include = {
  slot: true,
  trainer: {
    select: {
      id: true,
      trainerCode: true,
      userId: true,
      user: { select: { displayName: true } },
    },
  },
  member: {
    select: {
      id: true,
      memberCode: true,
      userId: true,
      user: { select: { displayName: true } },
    },
  },
} satisfies Prisma.AppointmentInclude;
type AppointmentRow = Prisma.AppointmentGetPayload<{ include: typeof include }>;

const STATUSES: AppointmentStatus[] = [
  "CONFIRMED",
  "CANCELLED_BY_MEMBER",
  "CANCELLED_BY_PT",
  "NO_SHOW",
  "COMPLETED",
];

const bad = (code: string, message: string) =>
  new BadRequestException({ code, message });
const conflict = (code: string, message: string) =>
  new ConflictException({ code, message });
const forbidden = (message = "Bạn không có quyền thực hiện thao tác này.") =>
  new ForbiddenException({ code: "FORBIDDEN", message });
const notFound = () =>
  new NotFoundException({
    code: "APPOINTMENT_NOT_FOUND",
    message: "Không tìm thấy lịch hẹn.",
  });

export function toAppointmentDto(a: AppointmentRow): AppointmentDto {
  return {
    id: a.id,
    code: a.code,
    status: a.status,
    ptSessionState: a.ptSessionState,
    slotId: a.slotId,
    workDate: a.slot.workDate.toISOString().slice(0, 10),
    startTime: a.slot.startTime.toISOString(),
    endTime: a.slot.endTime.toISOString(),
    trainer: {
      id: a.trainer.id,
      displayName: a.trainer.user.displayName,
      trainerCode: a.trainer.trainerCode,
    },
    member: {
      id: a.member.id,
      displayName: a.member.user.displayName,
      memberCode: a.member.memberCode,
    },
    cancelReason: a.cancelReason,
    cancelledAt: a.cancelledAt?.toISOString() ?? null,
    compensationGranted: a.compensationGranted,
    createdAt: a.createdAt.toISOString(),
  };
}

function isDateOnly(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

@Injectable()
export class PtBookingsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
  ) {}
  now = () => new Date();

  // ------------------------------------------------------------ APT-01
  /** bookAppointment: giữ ca + giữ 1 buổi PT trong cùng một transaction (SR02). */
  async book(
    user: CurrentUser,
    body: { slotId?: unknown; memberId?: unknown } | undefined,
  ): Promise<AppointmentActionResponse> {
    if (user.role === "TRAINER") throw forbidden("PT không đặt lịch cho hội viên.");
    const slotId = body?.slotId;
    if (typeof slotId !== "string" || !/^[0-9a-f-]{36}$/i.test(slotId))
      throw bad("INVALID_SLOT", "Vui lòng chọn ca tập hợp lệ.");
    const memberId = await this.resolveMemberId(user, body?.memberId);
    const now = this.now();

    const created = await this.prisma
      .$transaction(async (tx) => {
        // Khóa bi quan dòng WorkingSlot: hai người cùng đặt một ca thì chỉ một người qua.
        await tx.$queryRaw`SELECT id FROM "WorkingSlot" WHERE id = ${slotId}::uuid FOR UPDATE`;
        const slot = await tx.workingSlot.findUnique({
          where: { id: slotId },
          include: {
            trainer: {
              select: {
                workStatus: true,
                userId: true,
                user: { select: { status: true } },
              },
            },
          },
        });
        if (!slot)
          throw new NotFoundException({
            code: "SLOT_NOT_FOUND",
            message: "Không tìm thấy ca làm việc.",
          });
        if (slot.status === "BOOKED")
          throw conflict(
            "SLOT_ALREADY_BOOKED",
            "Ca này vừa có người đặt. Vui lòng chọn ca khác.",
          );
        if (
          slot.status !== "OPEN" ||
          slot.trainer.workStatus !== "ACTIVE" ||
          slot.trainer.user.status !== "ACTIVE"
        )
          throw conflict("SLOT_UNAVAILABLE", "Ca này hiện không nhận đặt lịch.");
        if (slot.startTime <= now)
          throw bad("SLOT_IN_PAST", "Ca tập này đã bắt đầu hoặc đã qua.");

        // Khóa hội viên để một người không đặt song song hai ca trùng giờ.
        await tx.$queryRaw`SELECT id FROM "MemberProfile" WHERE id = ${memberId}::uuid FOR UPDATE`;
        const member = await tx.memberProfile.findUnique({
          where: { id: memberId },
          select: { user: { select: { status: true } } },
        });
        if (!member || member.user.status !== "ACTIVE")
          throw forbidden("Tài khoản hội viên chưa được kích hoạt.");

        const clash = await tx.appointment.findFirst({
          where: {
            memberId,
            status: "CONFIRMED",
            slot: {
              startTime: { lt: slot.endTime },
              endTime: { gt: slot.startTime },
            },
          },
          select: { id: true },
        });
        if (clash)
          throw conflict(
            "MEMBER_TIME_CONFLICT",
            "Bạn đã có lịch hẹn PT khác trùng khung giờ này.",
          );

        // BR01: gói còn hạn tại ngày tập và còn >= 1 buổi PT.
        const candidates = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "Membership"
          WHERE "memberId" = ${memberId}::uuid AND "status" = 'ACTIVE'
            AND "ptSessionsRemaining" >= 1 AND "endsBefore" > ${slot.workDate.toISOString().slice(0, 10)}::date
          ORDER BY "endsBefore" ASC LIMIT 1 FOR UPDATE`;
        const membershipId = candidates[0]?.id;
        if (!membershipId)
          throw bad(
            "INSUFFICIENT_PT_SESSIONS",
            "Bạn đã hết số buổi PT khả dụng. Vui lòng mua thêm gói PT.",
          );

        const taken = await tx.workingSlot.updateMany({
          where: { id: slotId, status: "OPEN" },
          data: { status: "BOOKED", memberId },
        });
        if (taken.count !== 1)
          throw conflict("SLOT_ALREADY_BOOKED", "Ca này vừa có người đặt.");

        // holdPTSession: giữ 1 buổi (giảm ptSessionsRemaining) cùng transaction.
        await tx.membership.update({
          where: { id: membershipId },
          data: { ptSessionsRemaining: { decrement: 1 }, version: { increment: 1 } },
        });

        const seq = await tx.$queryRaw<{ n: number }[]>`SELECT nextval('appointment_code_seq')::int AS n`;
        const appointment = await tx.appointment.create({
          data: {
            code: `LH${String(seq[0]!.n).padStart(6, "0")}`,
            memberId,
            trainerId: slot.trainerId,
            slotId,
            membershipId,
          },
          include,
        });
        await this.audit(tx, user.id, appointment.id, "BOOK_APPOINTMENT", [
          "status",
          "ptSessionState",
        ]);
        return { appointment, trainerUserId: slot.trainer.userId };
      })
      .catch((error: unknown) => {
        if ((error as { code?: string }).code === "P2002")
          throw conflict("SLOT_ALREADY_BOOKED", "Ca này vừa có người đặt.");
        throw error;
      });

    // Nhắc lịch 24h/2h (UC16). Lỗi nhắc lịch không được làm hỏng lịch đã đặt.
    try {
      await this.notifications.scheduleAppointmentReminders({
        appointmentId: created.appointment.id,
        startTime: created.appointment.slot.startTime,
        memberUserId: created.appointment.member.userId,
        trainerUserId: created.trainerUserId,
        now,
      });
    } catch {
      /* reminders can be rebuilt later; booking stays valid */
    }
    return this.respond(created.appointment, null);
  }

  // ------------------------------------------------------------ APT-02
  async listMine(user: CurrentUser): Promise<AppointmentPageDto> {
    if (user.role !== "MEMBER") throw forbidden();
    const profile = await this.prisma.memberProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!profile) return { items: [], total: 0, ptAvailable: 0 };
    const [rows, ptAvailable] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { memberId: profile.id },
        include,
        orderBy: { slot: { startTime: "desc" } },
        take: 100,
      }),
      this.ptAvailable(this.prisma, profile.id),
    ]);
    return { items: rows.map(toAppointmentDto), total: rows.length, ptAvailable };
  }

  async list(
    user: CurrentUser,
    q: Record<string, unknown>,
  ): Promise<AppointmentPageDto> {
    if (user.role === "MEMBER") throw forbidden();
    const where: Prisma.AppointmentWhereInput = {};
    if (user.role === "TRAINER") {
      const me = await this.prisma.trainerProfile.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (!me) return { items: [], total: 0 };
      where.trainerId = me.id;
    } else if (typeof q.trainerId === "string" && q.trainerId) {
      where.trainerId = q.trainerId;
    }
    if (typeof q.memberId === "string" && q.memberId) where.memberId = q.memberId;
    if (q.status !== undefined && q.status !== "") {
      if (!STATUSES.includes(q.status as AppointmentStatus))
        throw bad("INVALID_STATUS", "Trạng thái lịch hẹn không hợp lệ.");
      where.status = q.status as AppointmentStatus;
    }
    for (const key of ["from", "to"] as const)
      if (q[key] !== undefined && q[key] !== "" && !isDateOnly(q[key]))
        throw bad("INVALID_RANGE", "Ngày lọc không hợp lệ (YYYY-MM-DD).");
    if (isDateOnly(q.from) || isDateOnly(q.to))
      where.slot = {
        workDate: {
          ...(isDateOnly(q.from) ? { gte: new Date(q.from) } : {}),
          ...(isDateOnly(q.to) ? { lte: new Date(q.to) } : {}),
        },
      };
    const rows = await this.prisma.appointment.findMany({
      where,
      include,
      orderBy: { slot: { startTime: "asc" } },
      take: 200,
    });
    return { items: rows.map(toAppointmentDto), total: rows.length };
  }

  // ------------------------------------------------------------ APT-03
  /** cancelAppointmentByMember (A1): mốc 12 giờ. */
  async cancelByMember(user: CurrentUser, id: string): Promise<AppointmentActionResponse> {
    if (user.role !== "MEMBER") throw forbidden();
    const now = this.now();
    let outcome: PtSessionOutcome = "REFUND";
    const row = await this.prisma.$transaction(async (tx) => {
      const appt = await this.lockConfirmed(tx, id);
      if (appt.member.userId !== user.id) throw forbidden(); // SR01
      this.assertNotStarted(appt, now);
      outcome = memberCancelOutcome(appt.slot.startTime, now);
      if (outcome === "REFUND") await this.credit(tx, appt.membershipId, 1);
      await tx.workingSlot.update({
        where: { id: appt.slotId },
        data: { status: "OPEN", memberId: null },
      });
      const updated = await tx.appointment.update({
        where: { id },
        data: {
          status: "CANCELLED_BY_MEMBER",
          ptSessionState: outcome === "REFUND" ? "REFUNDED" : "CONSUMED",
          cancelReason: "Hội viên hủy lịch",
          cancelledAt: now,
        },
        include,
      });
      await this.audit(tx, user.id, id, "CANCEL_APPOINTMENT_BY_MEMBER", [
        "status",
        "ptSessionState",
      ]);
      return updated;
    });
    await this.dropReminders(id);
    return this.respond(row, outcome);
  }

  // ------------------------------------------------------------ APT-04
  /** cancelAppointmentByPT (A2): mốc 6 giờ, < 6h đền bù thêm 1 buổi. */
  async cancelByPt(
    user: CurrentUser,
    id: string,
    body: { reason?: unknown } | undefined,
  ): Promise<AppointmentActionResponse> {
    if (user.role === "MEMBER") throw forbidden();
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (!reason)
      throw bad("REASON_REQUIRED", "Vui lòng nhập lý do hủy lịch.");
    if (reason.length > 500)
      throw bad("REASON_TOO_LONG", "Lý do hủy tối đa 500 ký tự.");
    const now = this.now();
    let outcome: PtSessionOutcome = "REFUND";
    const row = await this.prisma.$transaction(async (tx) => {
      const appt = await this.lockConfirmed(tx, id);
      if (user.role === "TRAINER" && appt.trainer.userId !== user.id)
        throw forbidden("Chỉ PT phụ trách ca này mới được hủy lịch."); // SR01
      this.assertNotStarted(appt, now);
      outcome = ptCancelOutcome(appt.slot.startTime, now);
      const compensated = outcome === "REFUND_WITH_COMPENSATION";
      await this.credit(tx, appt.membershipId, compensated ? 2 : 1);
      // PT không đứng lớp được: không mở lại ca cho người khác đặt.
      await tx.workingSlot.update({
        where: { id: appt.slotId },
        data: { status: "UNAVAILABLE", unavailableReason: reason, memberId: null },
      });
      const updated = await tx.appointment.update({
        where: { id },
        data: {
          status: "CANCELLED_BY_PT",
          ptSessionState: "REFUNDED",
          cancelReason: reason,
          cancelledAt: now,
          compensationGranted: compensated,
        },
        include,
      });
      await this.audit(tx, user.id, id, "CANCEL_APPOINTMENT_BY_PT", [
        "status",
        "ptSessionState",
        "compensationGranted",
      ]);
      return updated;
    });
    await this.dropReminders(id);
    return this.respond(row, outcome);
  }

  // ------------------------------------------------------------ APT-05
  /** verifyNoShow (A3): chỉ ADMIN, chỉ sau khi ca kết thúc. */
  async verifyNoShow(user: CurrentUser, id: string): Promise<AppointmentActionResponse> {
    if (user.role !== "ADMIN") throw forbidden();
    const now = this.now();
    const row = await this.prisma.$transaction(async (tx) => {
      const appt = await this.lockConfirmed(tx, id);
      if (!canVerifyNoShow(appt.slot.endTime, now))
        throw bad(
          "SLOT_NOT_ENDED",
          "Chỉ được xác minh vắng mặt sau khi ca tập đã kết thúc.",
        );
      // consumePTSession: buổi đã bị giữ từ lúc đặt nên chỉ chốt trạng thái, không hoàn.
      const updated = await tx.appointment.update({
        where: { id },
        data: { status: "NO_SHOW", ptSessionState: "CONSUMED", verifiedById: user.id },
        include,
      });
      await this.audit(tx, user.id, id, "VERIFY_NO_SHOW", [
        "status",
        "ptSessionState",
        "verifiedById",
      ]);
      return updated;
    });
    await this.dropReminders(id);
    return this.respond(row, "CONSUME");
  }

  // ------------------------------------------------------------ helpers
  private async resolveMemberId(user: CurrentUser, requested: unknown) {
    if (user.role === "ADMIN") {
      if (typeof requested !== "string" || !/^[0-9a-f-]{36}$/i.test(requested))
        throw bad("MEMBER_REQUIRED", "Vui lòng chọn hội viên cần đặt lịch.");
      return requested;
    }
    const profile = await this.prisma.memberProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!profile) throw forbidden("Không tìm thấy hồ sơ hội viên.");
    return profile.id;
  }

  private async lockConfirmed(tx: Tx, id: string): Promise<AppointmentRow> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound();
    await tx.$queryRaw`SELECT id FROM "Appointment" WHERE id = ${id}::uuid FOR UPDATE`;
    const appt = await tx.appointment.findUnique({ where: { id }, include });
    if (!appt) throw notFound();
    if (appt.status !== "CONFIRMED")
      throw conflict(
        "APPOINTMENT_NOT_CONFIRMED",
        "Lịch hẹn này đã được xử lý trước đó.",
      );
    // Khóa ca rồi gói tập theo cùng thứ tự với book() để tránh deadlock.
    await tx.$queryRaw`SELECT id FROM "WorkingSlot" WHERE id = ${appt.slotId}::uuid FOR UPDATE`;
    return appt;
  }

  private assertNotStarted(appt: AppointmentRow, now: Date) {
    if (appt.slot.startTime <= now)
      throw bad("APPOINTMENT_STARTED", "Ca tập đã bắt đầu, không thể hủy lịch.");
  }

  /** refundPTSession: cộng lại buổi (đền bù thì +2: 1 hoàn + 1 đền bù), cùng transaction. */
  private async credit(tx: Tx, membershipId: string, delta: number) {
    await tx.$queryRaw`SELECT id FROM "Membership" WHERE id = ${membershipId}::uuid FOR UPDATE`;
    const m = await tx.membership.findUniqueOrThrow({ where: { id: membershipId } });
    const remaining = m.ptSessionsRemaining + delta;
    const snapshot = Math.max(m.ptSessionsSnapshot, remaining);
    // Trigger của UC05 chỉ cho nâng snapshot khi bật cờ đền bù này.
    if (snapshot > m.ptSessionsSnapshot)
      await tx.$executeRawUnsafe("SET LOCAL fithub.allow_pt_compensation = 'on'");
    await tx.membership.update({
      where: { id: membershipId },
      data: {
        ptSessionsRemaining: remaining,
        ptSessionsSnapshot: snapshot,
        version: { increment: 1 },
      },
    });
  }

  private async ptAvailable(db: Pick<Tx, "membership">, memberId: string) {
    const sum = await db.membership.aggregate({
      where: { memberId, status: "ACTIVE" },
      _sum: { ptSessionsRemaining: true },
    });
    return sum._sum.ptSessionsRemaining ?? 0;
  }

  private async respond(
    row: AppointmentRow,
    ptSessionOutcome: PtSessionOutcome | null,
  ): Promise<AppointmentActionResponse> {
    return {
      appointment: toAppointmentDto(row),
      ptSessionOutcome,
      ptAvailable: await this.ptAvailable(this.prisma, row.memberId),
    };
  }

  private audit(tx: Tx, actorId: string, entityId: string, action: string, changedFields: string[]) {
    return tx.auditLog.create({
      data: { actorId, entityType: "Appointment", entityId, action, changedFields },
    });
  }

  private async dropReminders(appointmentId: string) {
    try {
      await this.notifications.cancelRemindersBySource("APPOINTMENT", appointmentId);
    } catch {
      /* a stale reminder is re-checked against Appointment.status before sending (BR03) */
    }
  }
}
