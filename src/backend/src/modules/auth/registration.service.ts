import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { EmailVerification } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { hashPassword } from "./password";
import { OtpMailer } from "./otp-mailer";
import { RegisterDto, VerifyEmailDto } from "./dto/register.dto";
const MINUTE = 60000;
function bad(code: string, message: string) {
  return new BadRequestException({ code, message });
}
function limited(code: string, message: string, at: Date) {
  return new HttpException({ code, message, retryAt: at.toISOString() }, 429);
}
function view(v: EmailVerification) {
  const [local, domain] = v.email.split("@");
  return {
    verificationId: v.id,
    emailMasked: `${local.slice(0, 2)}***@${domain}`,
    expiresAt: v.expiresAt.toISOString(),
    resendAt: new Date(v.lastSentAt.getTime() + MINUTE).toISOString(),
    deliveryStatus: v.deliveryStatus,
  };
}
@Injectable()
export class RegistrationService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(OtpMailer) private readonly mailer: OtpMailer,
  ) {}
  private secret() {
    const secret = process.env.OTP_HASH_SECRET || process.env.SESSION_SECRET;
    if (!secret || secret.length < 32)
      throw new ServiceUnavailableException({
        code: "OTP_NOT_CONFIGURED",
        message: "Dịch vụ xác minh chưa sẵn sàng.",
      });
    return secret;
  }
  private digest(email: string, generation: number, code: string) {
    return createHmac("sha256", this.secret())
      .update(`REGISTER:${email}:${generation}:${code}`)
      .digest("hex");
  }
  private freshCode(previous?: EmailVerification | null) {
    let code: string;
    do {
      code = String(randomInt(0, 1000000)).padStart(6, "0");
    } while (
      previous &&
      this.digest(previous.email, previous.generation, code) ===
        previous.codeHash
    );
    return code;
  }
  async register(input: RegisterDto) {
    if (input.password !== input.confirmPassword)
      throw bad("PASSWORD_MISMATCH", "Mật khẩu xác nhận không khớp.");
    this.mailer.assertConfigured();
    this.secret();
    const passwordHash = await hashPassword(input.password);
    const prepared = await this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.email}, 0))`;
        let user = await tx.user.findUnique({ where: { email: input.email } });
        if (
          user &&
          (user.role !== "MEMBER" || user.status !== "PENDING_VERIFY")
        )
          throw new ConflictException({
            code: "EMAIL_ALREADY_REGISTERED",
            message:
              "Email không thể dùng để đăng ký. Hãy đăng nhập hoặc liên hệ lễ tân.",
          });
        if (!user)
          user = await tx.user.create({
            data: {
              email: input.email,
              displayName: input.displayName?.trim() || "Hội viên mới",
              passwordHash,
              role: "MEMBER",
              status: "PENDING_VERIFY",
            },
          });
        // Do not overwrite an existing account password/name during anonymous registration.
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${user.id}::uuid FOR UPDATE`;
        const current = await tx.user.findUniqueOrThrow({
          where: { id: user.id },
        });
        if (
          current.role !== "MEMBER" ||
          current.status !== "PENDING_VERIFY" ||
          current.email !== input.email
        )
          throw new ConflictException({
            code: "EMAIL_ALREADY_REGISTERED",
            message:
              "Email không thể dùng để đăng ký. Hãy đăng nhập hoặc liên hệ lễ tân.",
          });
        const previous = await tx.emailVerification.findUnique({
          where: { userId: user.id },
        });
        const now = new Date();
        if (previous?.lockedUntil && previous.lockedUntil > now)
          throw limited(
            "OTP_LOCKED",
            "Đã nhập sai mã 5 lần. Vui lòng chờ 15 phút.",
            previous.lockedUntil,
          );
        if (previous && previous.lastSentAt.getTime() + MINUTE > now.getTime())
          return { verification: previous, code: null };
        const generation = (previous?.generation || 0) + 1;
        const code = this.freshCode(previous);
        const data = {
          email: input.email,
          codeHash: this.digest(input.email, generation, code),
          generation,
          expiresAt: new Date(now.getTime() + 5 * MINUTE),
          lastSentAt: now,
          consumedAt: null,
          deliveryStatus: "SENDING",
          ...(previous?.lockedUntil
            ? { failedAttempts: 0, lockedUntil: null }
            : {}),
        };
        const verification = await tx.emailVerification.upsert({
          where: { userId: user.id },
          create: { ...data, userId: user.id },
          update: data,
        });
        return { verification, code };
      },
      { timeout: 15000 },
    );
    return this.deliver(prepared);
  }
  private async deliver(prepared: {
    verification: EmailVerification;
    code: string | null;
  }) {
    const { verification, code } = prepared;
    if (!code) return view(verification);
    try {
      await this.mailer.send(
        verification.email,
        code,
        `register/${verification.id}/${verification.generation}`,
      );
    } catch (e) {
      await this.db.emailVerification.updateMany({
        where: { id: verification.id, generation: verification.generation },
        data: { deliveryStatus: "FAILED" },
      });
      throw new ServiceUnavailableException({
        code: "EMAIL_DELIVERY_FAILED",
        message: e instanceof Error ? e.message : "Chưa thể gửi email.",
        verification: { ...view(verification), deliveryStatus: "FAILED" },
      });
    }
    await this.db.emailVerification.updateMany({
      where: { id: verification.id, generation: verification.generation },
      data: { deliveryStatus: "SENT" },
    });
    return { ...view(verification), deliveryStatus: "SENT" };
  }
  async resend(id: string) {
    this.mailer.assertConfigured();
    this.secret();
    const previous = await this.db.emailVerification.findUnique({
      where: { id },
    });
    if (!previous)
      throw new NotFoundException({
        code: "VERIFICATION_NOT_FOUND",
        message: "Yêu cầu xác minh không tồn tại.",
      });
    const prepared = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${previous.userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({
        where: { id: previous.userId },
      });
      const v = await tx.emailVerification.findUniqueOrThrow({ where: { id } });
      const now = new Date();
      if (user.status !== "PENDING_VERIFY" || v.consumedAt)
        throw bad(
          "VERIFICATION_COMPLETED",
          "Tài khoản đã được xác minh. Hãy đăng nhập.",
        );
      if (v.lockedUntil && v.lockedUntil > now)
        throw limited(
          "OTP_LOCKED",
          "Xác minh đang tạm khóa. Vui lòng thử lại sau.",
          v.lockedUntil,
        );
      if (v.lastSentAt.getTime() + MINUTE > now.getTime())
        throw limited(
          "OTP_RESEND_TOO_SOON",
          "Vui lòng chờ trước khi gửi lại mã.",
          new Date(v.lastSentAt.getTime() + MINUTE),
        );
      const generation = v.generation + 1,
        code = this.freshCode(v);
      const verification = await tx.emailVerification.update({
        where: { id },
        data: {
          generation,
          codeHash: this.digest(v.email, generation, code),
          lastSentAt: now,
          expiresAt: new Date(now.getTime() + 5 * MINUTE),
          deliveryStatus: "SENDING",
          ...(v.lockedUntil ? { failedAttempts: 0, lockedUntil: null } : {}),
        },
      });
      return { verification, code };
    });
    return this.deliver(prepared);
  }
  async verify(input: VerifyEmailDto) {
    this.secret();
    if (input.password !== input.confirmPassword)
      throw bad("PASSWORD_MISMATCH", "Mật khẩu xác nhận không khớp.");
    const candidateHash = input.password
      ? await hashPassword(input.password)
      : null;
    const previous = await this.db.emailVerification.findUnique({
      where: { id: input.verificationId },
    });
    if (!previous)
      throw new NotFoundException({
        code: "VERIFICATION_NOT_FOUND",
        message: "Yêu cầu xác minh không tồn tại.",
      });
    const result = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${previous.userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({
        where: { id: previous.userId },
      });
      const v = await tx.emailVerification.findUniqueOrThrow({
        where: { id: input.verificationId },
      });
      const now = new Date();
      if (v.lockedUntil && v.lockedUntil > now)
        return {
          error: limited(
            "OTP_LOCKED",
            "Xác minh đang tạm khóa. Vui lòng thử lại sau.",
            v.lockedUntil,
          ),
        };
      const matches = timingSafeEqual(
        Buffer.from(v.codeHash, "hex"),
        Buffer.from(this.digest(v.email, v.generation, input.code), "hex"),
      );
      if (v.consumedAt)
        return matches && user.status === "ACTIVE"
          ? { ok: true }
          : { error: bad("OTP_USED", "Mã xác minh đã được sử dụng.") };
      if (
        user.role !== "MEMBER" ||
        user.status !== "PENDING_VERIFY" ||
        user.email !== v.email
      )
        return {
          error: bad(
            "ACCOUNT_NOT_ELIGIBLE",
            "Tài khoản không thể xác minh qua yêu cầu này.",
          ),
        };
      if (v.expiresAt <= now)
        return {
          error: bad("OTP_EXPIRED", "Mã đã hết hạn. Vui lòng gửi lại mã."),
        };
      if (!matches) {
        const attempts = Math.min(5, v.failedAttempts + 1),
          lockedUntil =
            attempts >= 5 ? new Date(now.getTime() + 15 * MINUTE) : null;
        await tx.emailVerification.update({
          where: { id: v.id },
          data: { failedAttempts: attempts, lockedUntil },
        });
        return {
          error: lockedUntil
            ? limited(
                "OTP_LOCKED",
                "Đã nhập sai mã 5 lần. Vui lòng chờ 15 phút.",
                lockedUntil,
              )
            : bad("OTP_INVALID", "Mã xác minh không chính xác."),
        };
      }
      if (!user.passwordHash && !candidateHash)
        return {
          error: bad(
            "PASSWORD_REQUIRED",
            "Nhập mật khẩu để hoàn tất tài khoản được tạo tại quầy.",
          ),
        };
      await tx.user.update({
        where: { id: user.id },
        data: {
          status: "ACTIVE",
          verifiedAt: now,
          ...(!user.passwordHash ? { passwordHash: candidateHash } : {}),
          failedLoginAttempts: 0,
          loginLockedUntil: null,
        },
      });
      const profile = await tx.memberProfile.findUnique({
        where: { userId: user.id },
      });
      if (!profile) {
        const [seq] = await tx.$queryRaw<
          { value: bigint }[]
        >`SELECT nextval('fithub_member_code_seq') AS value`;
        await tx.memberProfile.create({
          data: {
            userId: user.id,
            memberCode: `HV${String(seq.value).padStart(6, "0")}`,
          },
        });
      }
      await tx.emailVerification.update({
        where: { id: v.id },
        data: { consumedAt: now, failedAttempts: 0 },
      });
      return { ok: true };
    });
    if (result.error) throw result.error;
    return {
      verified: true,
      message: "Đăng ký tài khoản thành công. Bạn có thể đăng nhập.",
    };
  }
}
