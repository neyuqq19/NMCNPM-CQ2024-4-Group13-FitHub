import {
  ForbiddenException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import type { CurrentUser, LoginResponse } from "@fithub/contracts";
import { PrismaService } from "../../database/prisma.service";
import { LoginDto, normalizeIdentifier } from "./dto/login.dto";
import { eligibleMembership, gymClock } from "../check-ins/eligibility";
import { verifyPassword } from "./password";

const processTokenSecret = randomBytes(32).toString("hex");
function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function formatDateVN(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${d}/${m}/${y}`;
}

@Injectable()
export class AuthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async login(
    dto: LoginDto,
  ): Promise<LoginResponse & { membership?: unknown }> {
    const cleanId = String(normalizeIdentifier(dto.identifier));
    const isEmail = cleanId.includes("@");
    const now = new Date();

    const user = await this.prisma.user.findUnique({
      where: isEmail ? { email: cleanId } : { phone: cleanId },
    });

    if (!user) {
      await this.prisma.authEvent.create({
        data: {
          platform: dto.platform,
          deviceId: dto.deviceId,
          result: "INVALID_CREDENTIALS",
        },
      });
      throw new UnauthorizedException({
        code: "INVALID_CREDENTIALS",
        message: "Thông tin đăng nhập hoặc mật khẩu không chính xác.",
      });
    }

    if (user.status === "LOCKED" || user.status === "DEACTIVATED") {
      await this.prisma.authEvent.create({
        data: {
          userId: user.id,
          platform: dto.platform,
          deviceId: dto.deviceId,
          result: `ACCOUNT_${user.status}`,
        },
      });
      throw new ForbiddenException({
        code: `ACCOUNT_${user.status}`,
        message: "Tài khoản hội viên đang bị khóa hoặc đã ngừng hoạt động.",
      });
    }

    if (user.status === "PENDING_VERIFY" || !user.passwordHash) {
      await this.prisma.authEvent.create({
        data: {
          userId: user.id,
          platform: dto.platform,
          deviceId: dto.deviceId,
          result: "ACCOUNT_PENDING_VERIFY",
        },
      });
      throw new ForbiddenException({
        code: "ACCOUNT_PENDING_VERIFY",
        message: "Tài khoản chưa hoàn tất xác minh và thiết lập mật khẩu.",
      });
    }

    if (user.loginLockedUntil && user.loginLockedUntil > now) {
      throw new ForbiddenException({
        code: "LOGIN_TEMPORARILY_LOCKED",
        message: "Tài khoản tạm khóa 15 phút do nhập sai mật khẩu quá 5 lần.",
        retryAt: user.loginLockedUntil.toISOString(),
      });
    }

    const validPwd = await verifyPassword(dto.password, user.passwordHash);
    if (!validPwd) {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${user.id}::uuid FOR UPDATE`;
        const current = await tx.user.findUniqueOrThrow({
          where: { id: user.id },
        });
        if (current.loginLockedUntil && current.loginLockedUntil > now) return;
        const nextFails = current.failedLoginAttempts + 1;
        const lockUntil =
          nextFails >= 5 ? new Date(now.getTime() + 15 * 60 * 1000) : null;
        await tx.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: nextFails >= 5 ? 0 : nextFails,
            loginLockedUntil: lockUntil,
          },
        });
        await tx.authEvent.create({
          data: {
            userId: user.id,
            platform: dto.platform,
            deviceId: dto.deviceId,
            result: lockUntil ? "LOCKED_TOO_MANY_FAILURES" : "INVALID_PASSWORD",
          },
        });
      });

      throw new UnauthorizedException({
        code: "INVALID_CREDENTIALS",
        message: "Thông tin đăng nhập hoặc mật khẩu không chính xác.",
      });
    }

    // Kiểm tra quyền truy cập theo nền tảng (SAD 4.1)
    if (dto.platform === "WEB" && user.role === "MEMBER") {
      throw new ForbiddenException({
        code: "PLATFORM_FORBIDDEN",
        message: "Tài khoản Hội viên chỉ sử dụng trên ứng dụng FitHub Mobile.",
      });
    }
    if (dto.platform === "MOBILE" && user.role === "ADMIN") {
      throw new ForbiddenException({
        code: "PLATFORM_FORBIDDEN",
        message: "Tài khoản Quản trị viên chỉ sử dụng trên Web Admin.",
      });
    }

    const isUuid = (val?: string) =>
      typeof val === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        val,
      );
    const safeRequestId = isUuid(dto.requestId) ? dto.requestId : randomUUID();
    const safeDeviceId = isUuid(dto.deviceId) ? dto.deviceId : randomUUID();

    const rawToken = createHmac(
      "sha256",
      process.env.SESSION_SECRET || processTokenSecret,
    )
      .update(`login:${user.id}:${safeDeviceId}:${safeRequestId}`)
      .digest("hex");
    const tokenHash = sha256Hex(rawToken);
    let expiresAt = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

    await this.prisma.$transaction(async (tx) => {
      // Serialize session replacement for the same account, including concurrent devices.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${user.id}::uuid FOR UPDATE`;
      const current = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      if (
        current.status !== "ACTIVE" ||
        current.passwordHash !== user.passwordHash ||
        (current.loginLockedUntil !== null && current.loginLockedUntil > now)
      )
        throw new UnauthorizedException({
          code: "SESSION_ACCOUNT_CHANGED",
          message: "Tài khoản đã thay đổi. Vui lòng đăng nhập lại.",
        });
      // Kiểm tra idempotency theo requestId
      const existingByReq = await tx.session.findUnique({
        where: { requestId: safeRequestId },
      });
      if (existingByReq) {
        if (
          existingByReq.userId !== user.id ||
          existingByReq.deviceId !== safeDeviceId ||
          existingByReq.platform !== dto.platform ||
          existingByReq.tokenHash !== tokenHash ||
          existingByReq.revokedAt ||
          existingByReq.expiresAt <= now
        )
          throw new ConflictException({
            code: "LOGIN_REQUEST_CONFLICT",
            message:
              "Yêu cầu đăng nhập không còn hợp lệ. Vui lòng thử đăng nhập mới.",
          });
        expiresAt = existingByReq.expiresAt;
        return;
      }

      // Quy tắc 1 thiết bị cho Member (SAD 4.1 / BR UC02): thu hồi phiên cũ cùng transaction
      if (user.role === "MEMBER") {
        await tx.session.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: now },
        });
      }

      await tx.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          loginLockedUntil: null,
        },
      });

      await tx.session.create({
        data: {
          userId: user.id,
          tokenHash,
          requestId: safeRequestId,
          platform: dto.platform,
          deviceId: safeDeviceId,
          expiresAt,
        },
      });

      await tx.authEvent.create({
        data: {
          userId: user.id,
          platform: dto.platform,
          deviceId: safeDeviceId,
          result: "SUCCESS",
        },
      });
    });

    const currentUser: CurrentUser = {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      phone: user.phone,
      role: user.role,
    };

    const membership =
      user.role === "MEMBER"
        ? await this.getMyMembershipSummary(user.id)
        : undefined;

    return {
      user: currentUser,
      expiresAt: expiresAt.toISOString(),
      accessToken: rawToken,
      membership,
    };
  }

  async logout(header?: string) {
    await this.validateSession(header);
    await this.prisma.session.updateMany({
      where: {
        tokenHash: sha256Hex(header!.slice("Bearer ".length).trim()),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  async validateSession(authorizationHeader?: string): Promise<CurrentUser> {
    if (!authorizationHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException({
        code: "MISSING_TOKEN",
        message: "Phiên đăng nhập không hợp lệ.",
      });
    }
    const rawToken = authorizationHeader.slice("Bearer ".length).trim();
    const tokenHash = sha256Hex(rawToken);
    const now = new Date();

    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt <= now ||
      session.user.status !== "ACTIVE"
    ) {
      throw new UnauthorizedException({
        code: "SESSION_EXPIRED_OR_REVOKED",
        message: "Phiên đăng nhập đã hết hạn hoặc bị thu hồi.",
      });
    }

    return {
      id: session.user.id,
      displayName: session.user.displayName,
      email: session.user.email,
      phone: session.user.phone,
      role: session.user.role,
    };
  }

  async getMyMembershipSummary(userId: string) {
    const profile = await this.prisma.memberProfile.findUnique({
      where: { userId },
      include: {
        memberships: {
          orderBy: { startsOn: "desc" },
          include: { payment: true },
        },
      },
    });

    if (!profile) {
      return {
        state: "NONE",
        memberCode: "HV---",
        sessionsThisMonth: 0,
      };
    }

    const now = new Date();
    const day = gymClock(now).day;
    const current = profile.memberships
      .filter(
        (m) =>
          ["ACTIVE", "SCHEDULED"].includes(m.status) &&
          m.payment?.status === "CONFIRMED" &&
          m.grantsGymAccessSnapshot &&
          m.startsOn.toISOString().slice(0, 10) <= day &&
          day < m.endsBefore.toISOString().slice(0, 10),
      )
      .sort(
        (a, b) =>
          a.endsBefore.getTime() - b.endsBefore.getTime() ||
          a.id.localeCompare(b.id),
      );
    const latest =
      eligibleMembership(profile.memberships, now).membership ||
      current[0] ||
      profile.memberships[0];
    const sessionsThisMonth = await this.prisma.checkInRecord.count({
      where: {
        memberId: profile.id,
        checkedInAt: { gte: new Date(`${day.slice(0, 7)}-01T00:00:00+07:00`) },
      },
    });
    if (!latest) {
      return {
        state: "NONE",
        memberCode: profile.memberCode,
        sessionsThisMonth: 0,
        allowedHoursLabel: "Chưa đăng ký gói tập",
      };
    }

    const gymDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const refToday = new Date(`${gymDate}T00:00:00Z`);
    const startsOn = new Date(latest.startsOn);
    const endsBefore = new Date(latest.endsBefore);
    const endsInclusiveDate = new Date(endsBefore.getTime() - 24 * 3600 * 1000);

    const totalDays = Math.max(
      1,
      Math.round(
        (endsBefore.getTime() - startsOn.getTime()) / (24 * 3600 * 1000),
      ),
    );
    const daysRemaining = Math.max(
      0,
      Math.round(
        (endsBefore.getTime() - refToday.getTime()) / (24 * 3600 * 1000),
      ),
    );
    const daysUsed = Math.min(
      totalDays,
      Math.max(0, totalDays - daysRemaining),
    );

    const effectiveState =
      latest.status === "FROZEN" || latest.status === "CANCELLED"
        ? latest.status
        : latest.payment?.status !== "CONFIRMED"
          ? "PENDING_PAYMENT"
          : ["ACTIVE", "SCHEDULED"].includes(latest.status) &&
              startsOn <= refToday &&
              endsBefore > refToday
            ? "ACTIVE"
            : startsOn > refToday
              ? "SCHEDULED"
              : latest.status === "EXPIRED" || endsBefore <= refToday
                ? "EXPIRED"
                : latest.status;

    return {
      state: effectiveState,
      memberCode: profile.memberCode,
      membershipCode: latest.code,
      packageName: latest.packageNameSnapshot,
      durationMonths: latest.durationMonthsSnapshot,
      priceVND: Number(latest.priceSnapshot),
      startsOn: formatDateVN(startsOn),
      endsInclusive: formatDateVN(endsInclusiveDate),
      daysRemaining,
      daysUsed,
      totalDays,
      sessionsThisMonth,
      allowedHoursLabel:
        effectiveState === "ACTIVE"
          ? latest.accessWindowSnapshot === "OFF_PEAK"
            ? "Thấp điểm · 09:00 – 16:00"
            : "Toàn khung giờ · 05:30 – 22:00"
          : `Đã kết thúc ngày ${formatDateVN(endsInclusiveDate)}`,
    };
  }
}
