import { BadRequestException } from "@nestjs/common";
import type {
  CreateMemberRequest,
  UpdateMemberRequest,
} from "@fithub/contracts";

export function invalid(fieldErrors: Record<string, string>): never {
  throw new BadRequestException({
    code: "VALIDATION_ERROR",
    message: "Vui lòng kiểm tra các trường được đánh dấu.",
    fieldErrors,
  });
}
export function profileInput(
  body: unknown,
  create: boolean,
): CreateMemberRequest | UpdateMemberRequest {
  if (!body || typeof body !== "object" || Array.isArray(body))
    invalid({ form: "Dữ liệu không hợp lệ." });
  const b = body as Record<string, unknown>;
  const errors: Record<string, string> = {};
  const allowed = [
    "displayName",
    "dateOfBirth",
    "gender",
    "address",
    "heightCm",
    "weightKg",
    "injuryHistory",
    ...(create ? ["email", "phone", "existingUserId"] : ["version"]),
  ];
  for (const key of Object.keys(b))
    if (!allowed.includes(key))
      errors[key] = "Trường này không được phép thay đổi.";
  function str(key: string, max: number): string | null {
    const value = b[key];
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string" || value.length > max) {
      errors[key] = `Cần là văn bản tối đa ${max} ký tự.`;
      return null;
    }
    return value.trim() || null;
  }
  const displayName = str("displayName", 200);
  if (!displayName) errors.displayName = "Vui lòng nhập họ và tên.";
  const dateOfBirth = str("dateOfBirth", 10);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (
    dateOfBirth &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) ||
      !Number.isFinite(Date.parse(dateOfBirth)) ||
      new Date(dateOfBirth).toISOString().slice(0, 10) !== dateOfBirth ||
      dateOfBirth > today)
  )
    errors.dateOfBirth = "Ngày sinh không hợp lệ hoặc nằm trong tương lai.";
  const gender = str("gender", 10);
  if (gender && !["MALE", "FEMALE", "OTHER"].includes(gender))
    errors.gender = "Giới tính không hợp lệ.";
  const values: Record<string, number | null> = {};
  for (const key of ["heightCm", "weightKg"]) {
    const value = b[key];
    values[key] =
      value == null || value === ""
        ? null
        : typeof value === "number"
          ? value
          : NaN;
    if (
      values[key] !== null &&
      (!Number.isFinite(values[key]) ||
        values[key]! <= 0 ||
        values[key]! > 999.99 ||
        Math.abs(values[key]! * 100 - Math.round(values[key]! * 100)) >
          0.000001)
    )
      errors[key] =
        "Cần là số dương không vượt 999,99, tối đa 2 chữ số thập phân.";
  }
  const result: CreateMemberRequest & { version?: number } = {
    displayName: displayName || "",
    dateOfBirth,
    gender: gender as CreateMemberRequest["gender"],
    address: str("address", 500),
    injuryHistory: str("injuryHistory", 2000),
    ...values,
  };
  if (create) {
    result.email = str("email", 254)?.toLowerCase() || null;
    result.phone =
      str("phone", 30)
        ?.replace(/[\s.-]/g, "")
        .replace(/^\+84/, "0") || null;
    if (!result.email && !result.phone)
      errors.contact = "Cần ít nhất một số điện thoại hoặc email.";
    if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))
      errors.email = "Email không hợp lệ.";
    if (result.phone && !/^0[35789]\d{8}$/.test(result.phone))
      errors.phone = "Số điện thoại cần có 10 chữ số hợp lệ.";
    const existingUserId = str("existingUserId", 36);
    if (existingUserId) result.existingUserId = existingUserId;
  } else {
    if (!Number.isInteger(b.version) || Number(b.version) < 0)
      errors.version = "Phiên bản hồ sơ không hợp lệ.";
    result.version = b.version as number;
    for (const key of [
      "dateOfBirth",
      "gender",
      "address",
      "heightCm",
      "weightKg",
      "injuryHistory",
    ] as const) {
      if (!(key in b)) delete result[key];
    }
  }
  if (Object.keys(errors).length) invalid(errors);
  return result as CreateMemberRequest | UpdateMemberRequest;
}
