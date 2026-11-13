import { BadRequestException } from "@nestjs/common";
import type {
  CreateCertificationRequest,
  UpdateTrainerProfileRequest,
} from "@fithub/contracts";
import { gymClock } from "../check-ins/eligibility";

function invalid(fieldErrors: Record<string, string>): never {
  throw new BadRequestException({
    code: "INVALID_TRAINER_PROFILE",
    message: "Vui lòng kiểm tra các trường được đánh dấu.",
    fieldErrors,
  });
}

function fields(body: unknown, allowed: string[]) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    invalid({ form: "Dữ liệu không hợp lệ." });
  for (const key of Object.keys(body))
    if (!allowed.includes(key))
      invalid({ [key]: "Trường này không được phép thay đổi." });
  return body as Record<string, unknown>;
}

function version(value: unknown) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 2147483647
  )
    invalid({ version: "Phiên bản hồ sơ không hợp lệ." });
  return value;
}

export function deleteVersion(body: unknown) {
  return version(fields(body, ["version"]).version);
}

export function completeBio(value: string) {
  const length = Array.from(value.trim()).length;
  return length >= 1 && length <= 1000;
}

export function completeSpecialties(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= 10 &&
    value.every((s) => typeof s === "string" && s.trim().length > 0)
  );
}

export function profileInput(body: unknown): UpdateTrainerProfileRequest {
  const b = fields(body, [
    "version",
    "bio",
    "specialties",
    "experienceYears",
    "workStatus",
    "avatarUrl",
  ]);
  const errors: Record<string, string> = {};
  const workStatus = b.workStatus;
  if (
    workStatus !== undefined &&
    workStatus !== "ACTIVE" &&
    workStatus !== "ON_LEAVE"
  )
    errors.workStatus = "Trạng thái làm việc không hợp lệ.";
  const bio = typeof b.bio === "string" ? b.bio.trim() : "";
  if (!completeBio(bio)) errors.bio = "Tiểu sử phải có từ 1 đến 1000 ký tự.";
  const specialties = completeSpecialties(b.specialties)
    ? b.specialties.map((s) => s.trim())
    : [];
  if (!specialties.length)
    errors.specialties =
      "Cần từ 1 đến 10 chuyên môn, mỗi mục phải có nội dung.";
  const years = b.experienceYears;
  if (
    typeof years !== "number" ||
    !Number.isInteger(years) ||
    years < 0 ||
    years > 50
  )
    errors.experienceYears =
      "Số năm kinh nghiệm phải là số nguyên từ 0 đến 50.";
  const avatarUrl = typeof b.avatarUrl === "string" ? b.avatarUrl.trim() : null;
  if (
    (b.avatarUrl != null && typeof b.avatarUrl !== "string") ||
    (avatarUrl &&
      (!URL.canParse(avatarUrl) ||
        !["http:", "https:"].includes(new URL(avatarUrl).protocol)))
  )
    errors.avatarUrl = "Đường dẫn ảnh phải dùng HTTP hoặc HTTPS.";
  if (Object.keys(errors).length) invalid(errors);
  return {
    version: version(b.version),
    bio,
    specialties,
    experienceYears: years as number,
    ...(workStatus === "ACTIVE" || workStatus === "ON_LEAVE"
      ? { workStatus }
      : {}),
    ...(b.avatarUrl !== undefined ? { avatarUrl: avatarUrl || null } : {}),
  };
}

export function certificationInput(body: unknown): CreateCertificationRequest {
  const b = fields(body, [
    "version",
    "name",
    "issuer",
    "issuedAt",
    "credentialUrl",
  ]);
  const errors: Record<string, string> = {};
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const issuer = typeof b.issuer === "string" ? b.issuer.trim() : "";
  if (!name) errors.name = "Vui lòng nhập tên chứng chỉ.";
  if (!issuer) errors.issuer = "Vui lòng nhập tổ chức cấp.";
  if (b.credentialUrl != null && typeof b.credentialUrl !== "string")
    errors.credentialUrl = "Mã hoặc đường dẫn minh chứng không hợp lệ.";
  const issuedAt = typeof b.issuedAt === "string" ? b.issuedAt : "";
  const date = new Date(issuedAt);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(issuedAt) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== issuedAt ||
    issuedAt.startsWith("0000")
  )
    errors.issuedAt = "Ngày cấp chứng chỉ không hợp lệ.";
  else if (issuedAt > gymClock(new Date()).day) {
    const message = "Ngày cấp chứng chỉ không được vượt quá ngày hiện tại.";
    throw new BadRequestException({
      code: "FUTURE_ISSUE_DATE",
      message,
      fieldErrors: { issuedAt: message },
    });
  }
  if (Object.keys(errors).length) invalid(errors);
  return {
    version: version(b.version),
    name,
    issuer,
    issuedAt,
    credentialUrl:
      typeof b.credentialUrl === "string"
        ? b.credentialUrl.trim() || null
        : null,
  };
}

export function queryText(value: unknown, key: string) {
  if (value == null) return "";
  if (typeof value !== "string") invalid({ [key]: "Bộ lọc phải là văn bản." });
  return value.trim();
}
