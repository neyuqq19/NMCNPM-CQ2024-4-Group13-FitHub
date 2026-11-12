import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  generateWorkingSlots,
  type RegisterAvailabilityResponse,
  type WorkingSlotDto,
} from "@fithub/contracts";
import type { WorkingSlot } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { gymClock } from "../check-ins/eligibility";

const dayMs = 86400000;
const bufferMs = 15 * 60000;
const memberInclude = {
  member: {
    select: { memberCode: true, user: { select: { displayName: true } } },
  },
} as const;

function invalid(message: string, code = "INVALID_RANGE"): never {
  throw new BadRequestException({ code, message });
}

function localDate(value: unknown): Date {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value.startsWith("0000")
  )
    invalid("Ngày không hợp lệ.");
  const date = new Date(value);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    invalid("Ngày không hợp lệ.");
  return date;
}

function slotDto(
  row: WorkingSlot,
  member: WorkingSlotDto["member"] = null,
): WorkingSlotDto {
  return {
    id: row.id,
    trainerId: row.trainerId,
    workDate: row.workDate.toISOString().slice(0, 10),
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    status: row.status,
    unavailableReason:
      row.status === "UNAVAILABLE" ? row.unavailableReason : null,
    member: row.status === "BOOKED" ? member : null,
  };
}

type StatusChange = {
  status: "OPEN" | "UNAVAILABLE";
  unavailableReason: string | null;
};

export function statusInput(body: unknown): StatusChange {
  if (!body || typeof body !== "object")
    invalid("Trạng thái ca không hợp lệ.", "INVALID_AVAILABILITY");
  const { status, reason } = body as Record<string, unknown>;
  if (status !== "OPEN" && status !== "UNAVAILABLE")
    invalid("Chỉ được báo bận hoặc mở lại ca.", "INVALID_AVAILABILITY");
  if (reason != null && typeof reason !== "string")
    invalid("Lý do báo bận không hợp lệ.", "INVALID_AVAILABILITY");
  if (status === "UNAVAILABLE" && !reason?.trim())
    invalid("Vui lòng nhập lý do báo bận.", "INVALID_AVAILABILITY");
  return {
    status,
    unavailableReason:
      status === "UNAVAILABLE" ? (reason as string).trim() : null,
  };
}

@Injectable()
export class WorkingSlotsService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  now = () => new Date();

  async register(
    actorId: string,
    trainerId: string,
    body: unknown,
  ): Promise<RegisterAvailabilityResponse> {
    if (!body || typeof body !== "object")
      invalid("Khung giờ đăng ký không hợp lệ.");
    const { date, startTime, endTime } = body as Record<string, unknown>;
    if (
      typeof date !== "string" ||
      typeof startTime !== "string" ||
      typeof endTime !== "string" ||
      date < gymClock(this.now()).day
    )
      invalid("Chọn ngày từ hôm nay và khung giờ trong khoảng 06:00–22:00.");
    let generated: ReturnType<typeof generateWorkingSlots>;
    try {
      generated = generateWorkingSlots(date, startTime, endTime);
    } catch (err) {
      if (err instanceof Error && err.message === "RANGE_TOO_SHORT")
        invalid(
          "Khung giờ đăng ký phải tối thiểu 60 phút để tạo được ít nhất 1 ca làm việc.",
          "RANGE_TOO_SHORT",
        );
      invalid(
        "Ngày và khung giờ đăng ký phải hợp lệ, trong khoảng 06:00–22:00.",
      );
    }
    const workDate = new Date(date);
    const rows = generated.slots.map((slot) => ({
      trainerId,
      workDate,
      startTime: new Date(date + "T" + slot.startTime + ":00+07:00"),
      endTime: new Date(date + "T" + slot.endTime + ":00+07:00"),
    }));
    return this.db.$transaction(async (tx) => {
      // Serialize competing ranges, including when no WorkingSlot exists yet.
      await tx.$queryRaw`SELECT id FROM "TrainerProfile" WHERE id = ${trainerId}::uuid FOR UPDATE`;
      const conflict = await tx.workingSlot.findFirst({
        where: {
          trainerId,
          startTime: {
            lt: new Date(rows[rows.length - 1].endTime.getTime() + bufferMs),
          },
          endTime: { gt: new Date(rows[0].startTime.getTime() - bufferMs) },
        },
        select: { id: true },
      });
      if (conflict)
        throw new ConflictException({
          code: "SLOT_OVERLAP",
          message:
            "Khung giờ trùng với ca đã đăng ký hoặc khoảng nghỉ 15 phút.",
        });
      const saved = await tx.workingSlot.createManyAndReturn({ data: rows });
      await tx.auditLog.createMany({
        data: saved.map((s) => ({
          actorId,
          entityId: s.id,
          entityType: "WorkingSlot",
          action: "REGISTER_WORKING_SLOT",
          changedFields: [
            "trainerId",
            "workDate",
            "startTime",
            "endTime",
            "status",
          ],
        })),
      });
      return {
        slots: saved
          .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
          .map((s) => slotDto(s)),
        discardedMinutes: generated.discardedMinutes,
      };
    });
  }

  async schedule(
    trainerId: string,
    from: unknown,
    to: unknown,
  ): Promise<WorkingSlotDto[]> {
    const today = localDate(gymClock(this.now()).day);
    const monday = new Date(
      today.getTime() - ((today.getUTCDay() + 6) % 7) * dayMs,
    );
    const end = to === undefined ? undefined : localDate(to);
    const start =
      from !== undefined
        ? localDate(from)
        : end
          ? new Date(end.getTime() - 6 * dayMs)
          : monday;
    const until = end ?? new Date(start.getTime() + 6 * dayMs);
    if (until < start) invalid("Ngày kết thúc phải từ ngày bắt đầu trở đi.");
    const rows = await this.db.workingSlot.findMany({
      where: { trainerId, workDate: { gte: start, lte: until } },
      orderBy: { startTime: "asc" },
      include: memberInclude,
    });
    return rows.map((row) =>
      slotDto(
        row,
        row.member && {
          displayName: row.member.user.displayName,
          memberCode: row.member.memberCode,
        },
      ),
    );
  }

  async available(trainerId: string, date: unknown): Promise<WorkingSlotDto[]> {
    const rows = await this.db.workingSlot.findMany({
      where: {
        trainerId,
        trainer: {
          workStatus: "ACTIVE",
          user: { status: "ACTIVE", role: "TRAINER" },
        },
        workDate: localDate(date),
        status: "OPEN",
        startTime: { gt: this.now() },
      },
      orderBy: { startTime: "asc" },
    });
    return rows.map((row) => slotDto(row));
  }

  async change(
    actorId: string,
    trainerId: string,
    slotId: string,
    change: StatusChange | null,
  ) {
    return this.db.$transaction(async (tx) => {
      // UC08 may book concurrently. Read the committed status after acquiring the slot lock.
      await tx.$queryRaw`SELECT id FROM "WorkingSlot" WHERE id = ${slotId}::uuid FOR UPDATE`;
      const slot = await tx.workingSlot.findUnique({ where: { id: slotId } });
      if (!slot)
        throw new NotFoundException({
          code: "SLOT_NOT_FOUND",
          message: "Không tìm thấy ca làm việc.",
        });
      if (slot.trainerId !== trainerId)
        throw new ForbiddenException({
          code: "NOT_PROFILE_OWNER",
          message: "Chỉ PT sở hữu lịch mới được thay đổi ca.",
        });
      if (slot.status === "BOOKED")
        throw new ConflictException({
          code: "SLOT_ALREADY_BOOKED",
          message:
            "Ca này đã có hội viên đặt lịch. Vui lòng hủy lịch hẹn theo quy định nếu không thể đứng lớp.",
        });
      if (slot.startTime.getTime() - this.now().getTime() < dayMs)
        invalid(
          "Chỉ được báo bận hoặc thay đổi ca làm việc trước giờ bắt đầu tối thiểu 24 giờ.",
          "NOTICE_TOO_LATE",
        );
      const result = change
        ? slotDto(
            await tx.workingSlot.update({
              where: { id: slotId },
              data: change,
            }),
          )
        : null;
      if (!change) await tx.workingSlot.delete({ where: { id: slotId } });
      await tx.auditLog.create({
        data: {
          actorId,
          entityType: "WorkingSlot",
          entityId: slotId,
          action: change ? "SET_SLOT_AVAILABILITY" : "DELETE_WORKING_SLOT",
          changedFields: change ? ["status", "unavailableReason"] : [],
        },
      });
      return result;
    });
  }
}
