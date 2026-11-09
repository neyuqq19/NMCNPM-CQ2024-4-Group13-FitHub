import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { Prisma } from "@prisma/client";
import { Secret, TOTP } from "otpauth";
import type {
  CheckInResult,
  CheckInQrDto,
  CheckInQrStatus,
  RegisterScannerRequest,
  ScanCheckInRequest,
} from "@fithub/contracts";
import { PrismaService } from "../../database/prisma.service";
import { COOLDOWN_MS, eligibleMembership } from "./eligibility";

// A configured secret survives API restarts. Ephemeral fallback is limited to development.
const developmentSecret = randomBytes(32).toString("hex");
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function fail(code: string, message: string, retryAt?: string): never {
  throw new ConflictException({
    code,
    message,
    ...(retryAt ? { retryAt } : {}),
  });
}
@Injectable()
export class CheckInsService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {
    if (
      process.env.NODE_ENV === "production" &&
      !process.env.CHECKIN_SIGNING_SECRET
    )
      throw new Error("CHECKIN_SIGNING_SECRET is required in production");
  }
  // Overridden only through Nest's provider in isolated database tests.
  now() {
    return new Date();
  }
  async mySummary(
    header?: string,
  ): Promise<import("@fithub/contracts").MyCheckInSummaryDto> {
    return this.db.$transaction(async (tx) => {
      const session = await this.session(tx, header, "MEMBER");
      const profile = await tx.memberProfile.findUnique({
        where: { userId: session.userId },
      });
      const now = this.now();
      const today = new Date(now.getTime() + 7 * 3600000)
        .toISOString()
        .slice(0, 10);
      const monday = new Date(`${today}T00:00:00Z`);
      monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
      const week = Array.from({ length: 7 }, (_, i) => ({
        date: new Date(monday.getTime() + i * 86400000)
          .toISOString()
          .slice(0, 10),
        count: 0,
      }));
      const monthStart = new Date(`${today.slice(0, 7)}-01T00:00:00+07:00`);
      const weekStart = new Date(`${week[0].date}T00:00:00+07:00`);
      const records = profile
        ? await tx.checkInRecord.findMany({
            where: {
              memberId: profile.id,
              checkedInAt: {
                gte: new Date(
                  Math.min(monthStart.getTime(), weekStart.getTime()),
                ),
                lte: now,
              },
            },
            select: { checkedInAt: true },
          })
        : [];
      for (const record of records) {
        const day = new Date(record.checkedInAt.getTime() + 7 * 3600000)
          .toISOString()
          .slice(0, 10);
        const entry = week.find((d) => d.date === day);
        if (entry) entry.count++;
      }
      return {
        serverTime: now.toISOString(),
        sessionsThisMonth: records.filter((r) => r.checkedInAt >= monthStart)
          .length,
        week,
      };
    });
  }
  private secret() {
    return process.env.CHECKIN_SIGNING_SECRET || developmentSecret;
  }
  private sign(value: string) {
    return createHmac("sha256", this.secret())
      .update(value)
      .digest("base64url");
  }
  private otp(sessionId: string, timestamp: number) {
    const secret = createHmac("sha256", this.secret())
      .update(`totp:${sessionId}`)
      .digest("hex");
    return new TOTP({
      secret: Secret.fromHex(secret),
      algorithm: "SHA256",
      digits: 6,
      period: 20,
    }).generate({ timestamp });
  }
  private payload(qr: { id: string; sessionId: string; step: number }) {
    const value = `FH1.${qr.id}.${this.otp(qr.sessionId, qr.step * 20000)}`;
    return `${value}.${this.sign(value)}`;
  }
  private async session(
    tx: Prisma.TransactionClient,
    header: string | undefined,
    role?: string,
  ) {
    if (!header?.startsWith("Bearer "))
      throw new UnauthorizedException({
        code: "MISSING_TOKEN",
        message: "Vui lòng đăng nhập.",
      });
    const s = await tx.session.findUnique({
      where: { tokenHash: digest(header.slice(7).trim()) },
      include: { user: true },
    });
    if (
      !s ||
      s.revokedAt ||
      s.expiresAt <= this.now() ||
      s.user.status !== "ACTIVE"
    )
      throw new UnauthorizedException({
        code: "SESSION_EXPIRED_OR_REVOKED",
        message: "Phiên đăng nhập đã hết hạn hoặc bị thu hồi.",
      });
    if (role && s.user.role !== role)
      throw new ForbiddenException({
        code: "ROLE_FORBIDDEN",
        message: "Tài khoản không có quyền thực hiện thao tác.",
      });
    return s;
  }
  private memberDto(p: {
    id: string;
    memberCode: string;
    user: { displayName: string };
  }) {
    return {
      id: p.id,
      memberCode: p.memberCode,
      displayName: p.user.displayName,
    };
  }
  private packageDto(m: {
    id: string;
    packageNameSnapshot: string;
    startsOn: Date;
    endsBefore: Date;
  }) {
    return {
      id: m.id,
      name: m.packageNameSnapshot,
      startsOn: m.startsOn.toISOString().slice(0, 10),
      endsBefore: m.endsBefore.toISOString().slice(0, 10),
    };
  }
  async issue(header?: string): Promise<CheckInQrDto> {
    return this.db.$transaction(async (tx) => {
      const initial = await this.session(tx, header, "MEMBER");
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${initial.userId}::uuid FOR UPDATE`;
      const session = await this.session(tx, header, "MEMBER");
      const p = await tx.memberProfile.findUnique({
        where: { userId: session.userId },
        include: { user: true, memberships: { include: { payment: true } } },
      });
      if (!p)
        fail(
          "NO_MEMBERSHIP",
          "Bạn chưa có hồ sơ và gói tập. Vui lòng liên hệ quầy lễ tân.",
        );
      const now = this.now();
      const eligible = eligibleMembership(p.memberships, now);
      if (!eligible.membership) fail(eligible.code, eligible.message);
      const last = await tx.checkInRecord.findFirst({
        where: { memberId: p.id },
        orderBy: { checkedInAt: "desc" },
      });
      if (last && now.getTime() < last.checkedInAt.getTime() + COOLDOWN_MS)
        fail(
          "CHECKIN_COOLDOWN",
          "Chưa thể check-in lại trong vòng 10 phút.",
          new Date(last.checkedInAt.getTime() + COOLDOWN_MS).toISOString(),
        );
      const step = Math.floor(now.getTime() / 20000);
      const qr = await tx.checkInQr.upsert({
        where: { sessionId_step: { sessionId: session.id, step } },
        create: {
          memberId: p.id,
          sessionId: session.id,
          step,
          expiresAt: new Date((step + 1) * 20000),
        },
        update: {},
      });
      return {
        id: qr.id,
        payload: this.payload(qr),
        serverNow: now.toISOString(),
        expiresAt: qr.expiresAt.toISOString(),
        member: this.memberDto(p),
        membership: this.packageDto(eligible.membership),
      };
    });
  }
  async register(header: string | undefined, body: RegisterScannerRequest) {
    return this.db.$transaction(async (tx) => {
      const s = await this.session(tx, header, "ADMIN");
      const previous = await tx.checkInScanner.findUnique({
        where: {
          sessionId_deviceId: { sessionId: s.id, deviceId: body.deviceId },
        },
      });
      if (previous && !previous.enabled)
        throw new ForbiddenException({
          code: "SCANNER_DISABLED",
          message: "Camera quầy đã bị vô hiệu hóa.",
        });
      const scanner =
        previous ||
        (await tx.checkInScanner.create({
          data: {
            sessionId: s.id,
            adminId: s.userId,
            deviceId: body.deviceId,
            label: body.label.trim(),
          },
        }));
      return { id: scanner.id, label: scanner.label };
    });
  }
  private async scanner(
    tx: Prisma.TransactionClient,
    header: string | undefined,
    scannerId: string,
  ) {
    const s = await this.session(tx, header, "ADMIN");
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${s.userId}::uuid FOR SHARE`;
    await tx.$queryRaw`SELECT "id" FROM "Session" WHERE "id"=${s.id}::uuid FOR SHARE`;
    await tx.$queryRaw`SELECT "id" FROM "CheckInScanner" WHERE "id"=${scannerId}::uuid FOR SHARE`;
    await this.session(tx, header, "ADMIN");
    const scanner = await tx.checkInScanner.findUnique({
      where: { id: scannerId },
    });
    if (
      !scanner ||
      !scanner.enabled ||
      scanner.sessionId !== s.id ||
      scanner.adminId !== s.userId
    )
      throw new ForbiddenException({
        code: "SCANNER_INVALID",
        message: "Camera quầy không hợp lệ hoặc đã bị vô hiệu hóa.",
      });
    return scanner;
  }
  async scan(
    header: string | undefined,
    body: ScanCheckInRequest,
  ): Promise<CheckInResult> {
    return this.db.$transaction(
      async (tx) => {
        // Serialize retries before checking existing results, including requests arriving on different scanners.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${body.requestId}, 0))::text`;
        await this.scanner(tx, header, body.scannerId);
        const hash = digest(body.payload);
        const previous = await tx.checkInTransaction.findUnique({
          where: { id: body.requestId },
        });
        if (previous) {
          if (
            previous.scannerId !== body.scannerId ||
            previous.payloadHash !== hash
          )
            throw new ConflictException({
              code: "REQUEST_CONFLICT",
              message: "Mã yêu cầu đã được dùng cho một lần quét khác.",
            });
          return previous.result as unknown as CheckInResult;
        }
        let qrId: string | undefined;
        let result: CheckInResult = {
          requestId: body.requestId,
          accepted: false,
          code: "QR_INVALID",
          message: "Mã QR không hợp lệ.",
          serverNow: this.now().toISOString(),
        };
        let membershipId: string | undefined;
        let memberId: string | undefined;
        const match =
          /^FH1\.([0-9a-f-]{36})\.([0-9]{6})\.([A-Za-z0-9_-]{43})$/.exec(
            body.payload,
          );
        if (match) {
          const value = body.payload.slice(0, body.payload.lastIndexOf("."));
          const expected = this.sign(value);
          if (timingSafeEqual(Buffer.from(match[3]), Buffer.from(expected))) {
            const qr = await tx.checkInQr.findUnique({
              where: { id: match[1] },
            });
            if (qr && this.payload(qr) === body.payload) {
              qrId = qr.id;
              const profile = await tx.memberProfile.findUniqueOrThrow({
                where: { id: qr.memberId },
              });
              await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${profile.userId}::uuid FOR UPDATE`;
              // Lock profile/memberships too: deactivation and membership changes cannot race admission.
              await tx.$queryRaw`SELECT "id" FROM "MemberProfile" WHERE "id"=${profile.id}::uuid FOR UPDATE`;
              await tx.$queryRaw`SELECT "id" FROM "Membership" WHERE "memberId"=${profile.id}::uuid ORDER BY "id" FOR UPDATE`;
              await tx.$queryRaw`SELECT p."id" FROM "Payment" p JOIN "Membership" m ON m."id"=p."membershipId" WHERE m."memberId"=${profile.id}::uuid ORDER BY p."id" FOR UPDATE OF p`;
              await tx.$queryRaw`SELECT "id" FROM "Session" WHERE "id"=${qr.sessionId}::uuid FOR SHARE`;
              const memberSession = await tx.session.findUniqueOrThrow({
                where: { id: qr.sessionId },
              });
              const p = await tx.memberProfile.findUniqueOrThrow({
                where: { id: profile.id },
                include: {
                  user: true,
                  memberships: { include: { payment: true } },
                },
              });
              const now = this.now();
              result.serverNow = now.toISOString();
              result.member = this.memberDto(p);
              if (
                memberSession.revokedAt ||
                memberSession.expiresAt <= now ||
                p.user.status !== "ACTIVE"
              ) {
                result.code = "MEMBER_SESSION_INVALID";
                result.message =
                  "Tài khoản hoặc phiên đăng nhập của hội viên không còn hiệu lực.";
              } else if (
                now >= qr.expiresAt ||
                Math.floor(now.getTime() / 20000) !== qr.step
              ) {
                result.code = "QR_EXPIRED";
                result.message =
                  "Mã QR đã hết hạn. Vui lòng lấy mã mới trên mobile.";
              } else {
                const eligible = eligibleMembership(p.memberships, now);
                result.code = eligible.code;
                result.message = eligible.message;
                if (eligible.membership) {
                  result.membership = this.packageDto(eligible.membership);
                  const last = await tx.checkInRecord.findFirst({
                    where: { memberId: p.id },
                    orderBy: { checkedInAt: "desc" },
                  });
                  if (
                    last &&
                    now.getTime() < last.checkedInAt.getTime() + COOLDOWN_MS
                  ) {
                    result.code = "CHECKIN_COOLDOWN";
                    result.message =
                      "Chưa thể check-in lại trong vòng 10 phút.";
                    result.retryAt = new Date(
                      last.checkedInAt.getTime() + COOLDOWN_MS,
                    ).toISOString();
                  } else {
                    result.accepted = true;
                    result.code = "CHECKIN_ACCEPTED";
                    result.message = "Được phép vào tập tại quầy.";
                    result.checkedInAt = now.toISOString();
                    result.retryAt = new Date(
                      now.getTime() + COOLDOWN_MS,
                    ).toISOString();
                    membershipId = eligible.membership.id;
                    memberId = p.id;
                  }
                }
              }
            }
          }
        }
        // Revalidate the operator after any lock wait, immediately before committing a decision.
        await this.scanner(tx, header, body.scannerId);
        await tx.checkInTransaction.create({
          data: {
            id: body.requestId,
            scannerId: body.scannerId,
            qrId,
            payloadHash: hash,
            result: result as unknown as Prisma.InputJsonValue,
          },
        });
        if (result.accepted)
          await tx.checkInRecord.create({
            data: {
              transactionId: body.requestId,
              memberId: memberId!,
              membershipId: membershipId!,
              checkedInAt: new Date(result.checkedInAt!),
            },
          });
        return result;
      },
      { timeout: 15000 },
    );
  }
  async transaction(header: string | undefined, requestId: string) {
    return this.db.$transaction(async (tx) => {
      const result = await tx.checkInTransaction.findUnique({
        where: { id: requestId },
      });
      if (!result) {
        await this.session(tx, header, "ADMIN");
        throw new NotFoundException({
          code: "TRANSACTION_NOT_FOUND",
          message: "Chưa tìm thấy kết quả. Có thể thử lại cùng yêu cầu.",
        });
      }
      await this.scanner(tx, header, result.scannerId);
      return result.result as unknown as CheckInResult;
    });
  }
  async status(
    header: string | undefined,
    id: string,
  ): Promise<CheckInQrStatus> {
    return this.db.$transaction(async (tx) => {
      const s = await this.session(tx, header, "MEMBER");
      const qr = await tx.checkInQr.findUnique({ where: { id } });
      if (!qr || qr.sessionId !== s.id)
        throw new NotFoundException({
          code: "QR_NOT_FOUND",
          message: "Không tìm thấy mã QR.",
        });
      // Include success for an earlier QR from this visit, even after rotation/backgrounding.
      const last = await tx.checkInRecord.findFirst({
        where: {
          memberId: qr.memberId,
          checkedInAt: { gte: new Date(this.now().getTime() - COOLDOWN_MS) },
        },
        include: { transaction: true },
        orderBy: { checkedInAt: "desc" },
      });
      const rejected = await tx.checkInTransaction.findFirst({
        where: { qrId: id },
        orderBy: { createdAt: "desc" },
      });
      return {
        serverNow: this.now().toISOString(),
        result: (last?.transaction.result ||
          rejected?.result ||
          null) as unknown as CheckInResult | null,
      };
    });
  }
}
