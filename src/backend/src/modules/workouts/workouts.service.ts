import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  calculateEpley1RM,
  type PersonalRecordDto,
  type WorkoutHistoryResponse,
  type WorkoutSessionDto,
  type WorkoutSetType,
} from "@fithub/contracts";
import { PrismaService } from "../../database/prisma.service";
import { AuthService } from "../auth/auth.service";
import { currentStreak, replayPersonalRecords, totalVolume } from "./workouts.rules";
import { exerciseKey, parseWorkoutInput, todayInGym, type ParsedWorkout } from "./workouts.validation";

type Tx = Prisma.TransactionClient;
const sessionInclude = {
  exercises: {
    orderBy: { orderIndex: "asc" },
    include: { sets: { orderBy: { setNumber: "asc" } } },
  },
} satisfies Prisma.WorkoutSessionInclude;
type SessionRow = Prisma.WorkoutSessionGetPayload<{ include: typeof sessionInclude }>;

const day = (d: Date) => d.toISOString().slice(0, 10);
const asDate = (s: string) => new Date(`${s}T00:00:00Z`);
const num = (d: Prisma.Decimal | null) => (d === null ? null : Number(d));
const TX = { timeout: 15000 };

@Injectable()
export class WorkoutsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  // Overridden in isolated database tests.
  now() {
    return new Date();
  }

  /** SR01: the member always comes from the login session, never from the request. */
  private async member(header?: string) {
    const user = await this.auth.validateSession(header);
    if (user.role !== "MEMBER")
      throw new ForbiddenException({
        code: "ROLE_FORBIDDEN",
        message: "Chỉ hội viên mới dùng được nhật ký tập luyện.",
      });
    const profile = await this.db.memberProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!profile)
      throw new ForbiddenException({
        code: "MEMBER_PROFILE_NOT_FOUND",
        message: "Tài khoản chưa có hồ sơ hội viên.",
      });
    return profile.id;
  }

  /** Serialises writes per member so record replays never interleave. */
  private async lock(tx: Tx, memberId: string) {
    await tx.$queryRaw`SELECT "id" FROM "MemberProfile" WHERE "id" = ${memberId}::uuid FOR UPDATE`;
  }

  private async owned(tx: Tx, memberId: string, id: string) {
    const row = await tx.workoutSession.findUnique({
      where: { id },
      select: { memberId: true, exercises: { select: { exerciseKey: true } } },
    });
    if (!row)
      throw new NotFoundException({
        code: "WORKOUT_NOT_FOUND",
        message: "Không tìm thấy buổi tập.",
      });
    if (row.memberId !== memberId)
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Bạn chỉ được xem và chỉnh sửa nhật ký tập luyện của chính mình.",
      });
    return row.exercises.map((e) => e.exerciseKey);
  }

  private exercisesData(input: ParsedWorkout) {
    return input.exercises.map((e) => ({
      exerciseName: e.exerciseName,
      exerciseKey: e.exerciseKey,
      orderIndex: e.orderIndex,
      sets: {
        create: e.sets.map((s) => ({
          setNumber: s.setNumber,
          setType: s.setType,
          reps: s.reps,
          weightKg: s.weightKg,
          estimated1RM: calculateEpley1RM(s.setType, s.weightKg, s.reps),
        })),
      },
    }));
  }

  private volume(input: ParsedWorkout) {
    return totalVolume(input.exercises.flatMap((e) => e.sets));
  }

  /** BR04: rebuild PersonalRecord and isPR flags for the given exercises. */
  private async rebuildRecords(tx: Tx, memberId: string, keys: Iterable<string>) {
    for (const key of new Set(keys)) {
      const exercises = await tx.workoutExercise.findMany({
        where: { exerciseKey: key, session: { memberId } },
        include: {
          session: { select: { id: true, performedOn: true, createdAt: true } },
          sets: { select: { id: true, setNumber: true, estimated1RM: true } },
        },
      });
      const { prSetIds, record } = replayPersonalRecords(
        exercises.map((e) => ({
          id: e.session.id,
          performedOn: day(e.session.performedOn),
          createdAt: e.session.createdAt,
          sets: e.sets.map((s) => ({ ...s, estimated1RM: num(s.estimated1RM) })),
        })),
      );
      const exerciseIds = exercises.map((e) => e.id);
      await tx.workoutSet.updateMany({
        where: { exerciseId: { in: exerciseIds }, isPR: true, id: { notIn: [...prSetIds] } },
        data: { isPR: false },
      });
      if (prSetIds.size)
        await tx.workoutSet.updateMany({ where: { id: { in: [...prSetIds] } }, data: { isPR: true } });
      if (!record) {
        await tx.personalRecord.deleteMany({ where: { memberId, exerciseKey: key } });
        continue;
      }
      const holder = exercises.find((e) => e.session.id === record.sessionId)!;
      const set = await tx.workoutSet.findUniqueOrThrow({ where: { id: record.setId } });
      const data = {
        exerciseName: holder.exerciseName,
        oneRepMax: record.oneRepMax,
        weightKg: set.weightKg,
        reps: set.reps,
        achievedOn: holder.session.performedOn,
        setId: record.setId,
        isBaseline: record.isBaseline,
      };
      await tx.personalRecord.upsert({
        where: { memberId_exerciseKey: { memberId, exerciseKey: key } },
        create: { memberId, exerciseKey: key, ...data },
        update: data,
      });
    }
  }

  private toDto(row: SessionRow): WorkoutSessionDto {
    const exercises = row.exercises.map((e) => ({
      id: e.id,
      exerciseName: e.exerciseName,
      orderIndex: e.orderIndex,
      sets: e.sets.map((s) => {
        const weightKg = Number(s.weightKg);
        return {
          id: s.id,
          setNumber: s.setNumber,
          setType: s.setType as WorkoutSetType,
          reps: s.reps,
          weightKg,
          volume: Math.round(s.reps * weightKg * 100) / 100,
          estimated1RM: num(s.estimated1RM),
          isPR: s.isPR,
        };
      }),
    }));
    return {
      id: row.id,
      title: row.title,
      performedOn: day(row.performedOn),
      durationMinutes: row.durationMinutes,
      notes: row.notes,
      totalVolume: Number(row.totalVolume),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      exercises,
      newRecords: exercises.flatMap((e) =>
        e.sets
          .filter((s) => s.isPR)
          .map((s) => ({ exerciseName: e.exerciseName, oneRepMax: s.estimated1RM! })),
      ),
    };
  }

  private async load(tx: Tx, id: string) {
    return this.toDto(
      await tx.workoutSession.findUniqueOrThrow({ where: { id }, include: sessionInclude }),
    );
  }

  /** WKO-01 */
  async create(header: string | undefined, body: unknown) {
    const memberId = await this.member(header);
    const input = parseWorkoutInput(body, this.now());
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, memberId);
      const created = await tx.workoutSession.create({
        data: {
          memberId,
          title: input.title,
          performedOn: asDate(input.performedOn),
          durationMinutes: input.durationMinutes,
          notes: input.notes,
          totalVolume: this.volume(input),
          exercises: { create: this.exercisesData(input) },
        },
        select: { id: true },
      });
      await this.rebuildRecords(tx, memberId, input.exercises.map((e) => e.exerciseKey));
      return this.load(tx, created.id);
    }, TX);
  }

  /** WKO-02 (A1) */
  async update(header: string | undefined, id: string, body: unknown) {
    const memberId = await this.member(header);
    const input = parseWorkoutInput(body, this.now());
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, memberId);
      const oldKeys = await this.owned(tx, memberId, id);
      await tx.workoutExercise.deleteMany({ where: { sessionId: id } });
      await tx.workoutSession.update({
        where: { id },
        data: {
          title: input.title,
          performedOn: asDate(input.performedOn),
          durationMinutes: input.durationMinutes,
          notes: input.notes,
          totalVolume: this.volume(input),
          exercises: { create: this.exercisesData(input) },
        },
      });
      await this.rebuildRecords(tx, memberId, [
        ...oldKeys,
        ...input.exercises.map((e) => e.exerciseKey),
      ]);
      return this.load(tx, id);
    }, TX);
  }

  /** WKO-02 (A2) */
  async remove(header: string | undefined, id: string) {
    const memberId = await this.member(header);
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, memberId);
      const keys = await this.owned(tx, memberId, id);
      await tx.workoutSession.delete({ where: { id } });
      await this.rebuildRecords(tx, memberId, keys);
      return { id, deleted: true };
    }, TX);
  }

  async getOne(header: string | undefined, id: string) {
    const memberId = await this.member(header);
    return this.db.$transaction(async (tx) => {
      await this.owned(tx, memberId, id);
      return this.load(tx, id);
    });
  }

  /** WKO-03 */
  async listMine(
    header: string | undefined,
    query: Record<string, string | undefined> = {},
  ): Promise<WorkoutHistoryResponse> {
    const memberId = await this.member(header);
    const page = query.page === undefined ? 1 : Number(query.page);
    const pageSize = query.pageSize === undefined ? 10 : Number(query.pageSize);
    const errors: Record<string, string> = {};
    if (!Number.isInteger(page) || page < 1) errors.page = "Trang phải là số nguyên ≥ 1.";
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50)
      errors.pageSize = "Số dòng mỗi trang từ 1 đến 50.";
    for (const key of ["from", "to"] as const) {
      const v = query[key];
      if (v !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || day(asDate(v)) !== v))
        errors[key] = "Ngày không hợp lệ (YYYY-MM-DD).";
    }
    if (Object.keys(errors).length)
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Bộ lọc không hợp lệ.",
        fieldErrors: errors,
      });
    const exercise = query.exercise ? exerciseKey(query.exercise) : "";
    const where: Prisma.WorkoutSessionWhereInput = {
      memberId,
      ...(query.from || query.to
        ? {
            performedOn: {
              ...(query.from ? { gte: asDate(query.from) } : {}),
              ...(query.to ? { lte: asDate(query.to) } : {}),
            },
          }
        : {}),
      ...(exercise ? { exercises: { some: { exerciseKey: { contains: exercise } } } } : {}),
    };
    const [total, rows, stats] = await Promise.all([
      this.db.workoutSession.count({ where }),
      this.db.workoutSession.findMany({
        where,
        include: sessionInclude,
        orderBy: [{ performedOn: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.monthStats(memberId),
    ]);
    return { items: rows.map((r) => this.toDto(r)), total, page, pageSize, stats };
  }

  private async monthStats(memberId: string) {
    const today = todayInGym(this.now());
    const month = today.slice(0, 7);
    const monthStart = asDate(`${month}-01`);
    const nextMonth = new Date(monthStart);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const streakFrom = asDate(today);
    streakFrom.setUTCDate(streakFrom.getUTCDate() - 400);
    const [inMonth, recent] = await Promise.all([
      this.db.workoutSession.aggregate({
        where: { memberId, performedOn: { gte: monthStart, lt: nextMonth } },
        _count: { _all: true },
        _sum: { durationMinutes: true, totalVolume: true },
      }),
      this.db.workoutSession.findMany({
        where: { memberId, performedOn: { gte: streakFrom, lte: asDate(today) } },
        select: { performedOn: true },
        distinct: ["performedOn"],
      }),
    ]);
    return {
      month,
      sessionsThisMonth: inMonth._count._all,
      totalMinutesThisMonth: inMonth._sum.durationMinutes ?? 0,
      totalVolumeThisMonth: Number(inMonth._sum.totalVolume ?? 0),
      currentStreakDays: currentStreak(new Set(recent.map((r) => day(r.performedOn))), today),
    };
  }

  /** WKO-04 */
  async records(header: string | undefined): Promise<PersonalRecordDto[]> {
    const memberId = await this.member(header);
    const rows = await this.db.personalRecord.findMany({
      where: { memberId },
      orderBy: [{ updatedAt: "desc" }],
    });
    const holders = await this.db.workoutSet.findMany({
      where: { id: { in: rows.map((r) => r.setId) } },
      select: { id: true, exercise: { select: { sessionId: true } } },
    });
    const sessionOf = new Map(holders.map((h) => [h.id, h.exercise.sessionId]));
    return rows.map((r) => ({
      exerciseName: r.exerciseName,
      oneRepMax: Number(r.oneRepMax),
      weightKg: Number(r.weightKg),
      reps: r.reps,
      achievedOn: day(r.achievedOn),
      sessionId: sessionOf.get(r.setId) ?? null,
      isBaseline: r.isBaseline,
      isPR: !r.isBaseline,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }
}
