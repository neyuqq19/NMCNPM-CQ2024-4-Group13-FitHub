export * from "./constants";

export type Role = "ADMIN" | "TRAINER" | "MEMBER";
export type Platform = "WEB" | "MOBILE";

export interface CurrentUser {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  role: Role;
}

export interface LoginRequest {
  identifier: string;
  password: string;
  platform: Platform;
  deviceId: string;
  requestId: string;
}

export interface LoginResponse {
  user: CurrentUser;
  expiresAt: string;
  accessToken?: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  retryAt?: string;
  fieldErrors?: Record<string, string>;
  memberId?: string;
  existingUserId?: string;
}

export interface PackageDto {
  accessWindow?: "REGULAR" | "OFF_PEAK";
  id: string;
  code: string;
  name: string;
  durationMonths: number;
  price: number;
  grantsGymAccess: boolean;
}

export interface MemberDto {
  id: string;
  memberCode: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  accountStatus: string;
  verifiedAt: Date | string | null;
  version: number;
  latestMembership: {
    code: string;
    packageName: string;
    status: string;
    startsOn: Date | string;
    endsBefore: Date | string;
  } | null;
}

export type AccountStatus =
  "PENDING_VERIFY" | "ACTIVE" | "LOCKED" | "DEACTIVATED";
export interface MemberProfileInput {
  displayName: string;
  dateOfBirth?: string | null;
  gender?: "MALE" | "FEMALE" | "OTHER" | null;
  address?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  injuryHistory?: string | null;
}
export interface CreateMemberRequest extends MemberProfileInput {
  email?: string | null;
  phone?: string | null;
  existingUserId?: string;
}
export interface UpdateMemberRequest extends MemberProfileInput {
  version: number;
}
export interface DeactivateMemberRequest {
  version: number;
  reason: string;
}
export interface MembershipSummary {
  id: string;
  code: string;
  packageName: string;
  status: string;
  startsOn: string;
  endsBefore: string;
}
export interface PackagePurchaseDto extends MembershipSummary {
  registeredAt: string;
  price: number;
  payment: {
    code: string;
    amount: number;
    method: string;
    status: "PENDING" | "CONFIRMED" | "CANCELLED";
    confirmedAt: string | null;
  } | null;
}
export interface MemberDetailDto extends MemberProfileInput {
  id: string;
  memberCode: string;
  email: string | null;
  phone: string | null;
  accountStatus: AccountStatus;
  verifiedAt: string | null;
  version: number;
  memberships: MembershipSummary[];
  purchaseHistory: PackagePurchaseDto[];
  createdAt: string;
  totalSpent: number;
}
export interface MemberOverviewDto {
  total: number;
  active: number;
  pendingVerification: number;
  unavailable: number;
}
export interface MemberPage {
  items: MemberDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RegisterRequest {
  email: string;
  password: string;
  confirmPassword: string;
  displayName?: string;
}
export interface EmailVerificationDto {
  verificationId: string;
  emailMasked: string;
  expiresAt: string;
  resendAt: string;
  deliveryStatus: "SENDING" | "SENT" | "FAILED";
}
export interface VerifyEmailRequest {
  verificationId: string;
  code: string;
  password?: string;
  confirmPassword?: string;
}

export interface CheckInMember {
  id: string;
  memberCode: string;
  displayName: string;
}
export interface CheckInPackage {
  id: string;
  name: string;
  startsOn: string;
  endsBefore: string;
}
export interface CheckInResult {
  requestId: string;
  accepted: boolean;
  code: string;
  message: string;
  serverNow: string;
  member?: CheckInMember;
  membership?: CheckInPackage;
  checkedInAt?: string;
  retryAt?: string;
}
export interface CheckInQrDto {
  id: string;
  payload: string;
  serverNow: string;
  expiresAt: string;
  member: CheckInMember;
  membership: CheckInPackage;
}
export interface CheckInQrStatus {
  serverNow: string;
  result: CheckInResult | null;
}
export interface RegisterScannerRequest {
  deviceId: string;
  label: string;
}
export interface ScanCheckInRequest {
  scannerId: string;
  requestId: string;
  payload: string;
}
export interface CheckInScannerDto {
  id: string;
  label: string;
}

export interface PurchaseOptionsDto {
  member: {
    id: string;
    memberCode: string;
    displayName: string;
    accountStatus: string;
    verified: boolean;
  };
  packages: PackageDto[];
  suggestedStartsOn: string;
  pendingPayments: { id: string; code: string }[];
}
export interface RegisterMembershipRequest {
  requestId: string;
  packageId: string;
  startsOn: string;
  expectedPrice: number;
}
export interface PaymentDetailDto {
  id: string;
  code: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  amount: number;
  method: string;
  createdAt: string;
  confirmedAt: string | null;
  confirmedBy: string | null;
  isTest: boolean;
  member: {
    id: string;
    memberCode: string;
    displayName: string;
    accountStatus: string;
  };
  membership: {
    id: string;
    code: string;
    packageName: string;
    status: string;
    startsOn: string;
    endsBefore: string;
    accessWindow: string;
    grantsGymAccess: boolean;
  };
}
export interface PaymentPageDto {
  items: PaymentDetailDto[];
  total: number;
  page: number;
  pageSize: number;
}
export interface ConfirmPaymentRequest {
  idempotencyKey: string;
  amount: number;
}
export interface DashboardDto {
  range: "7d" | "30d" | "month";
  newMembers: number;
  checkInSeries: { date: string; count: number }[];
  day: string;
  activeMembers: number;
  pendingMembers: number;
  checkInsToday: number;
  revenueToday: number;
  confirmedPaymentsToday: number;
  recentPayments: PaymentDetailDto[];
}

export interface MyCheckInSummaryDto {
  serverTime: string;
  sessionsThisMonth: number;
  week: { date: string; count: number }[];
}

// ===== UC13 — Nhật ký tập luyện (SAD 4.9, UCSpec 3.4.4) =====

/** W = khởi động, R = hiệp chính, D = drop set, F = tới ngưỡng thất bại. */
export type WorkoutSetType = "W" | "R" | "D" | "F";
export const WORKOUT_SET_TYPES: readonly WorkoutSetType[] = ["W", "R", "D", "F"];
export const WORKOUT_LIMITS = {
  repsMax: 500,
  weightKgMax: 1000,
  exercisesMax: 30,
  setsPerExerciseMax: 50,
  titleMax: 120,
  exerciseNameMax: 80,
  notesMax: 1000,
  durationMinutesMax: 600,
} as const;

/**
 * BR02/BR03 — Epley 1RM. Only working sets (R) with external load count;
 * W, D, F and bodyweight sets return null so they never affect records.
 */
export function calculateEpley1RM(
  setType: WorkoutSetType,
  weightKg: number,
  reps: number,
): number | null {
  if (setType !== "R" || !(weightKg > 0) || !(reps >= 1)) return null;
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 100) / 100;
}

export interface WorkoutSetInput {
  setType: WorkoutSetType;
  reps: number;
  weightKg: number;
}
export interface WorkoutExerciseInput {
  exerciseName: string;
  sets: WorkoutSetInput[];
}
export interface CreateWorkoutSessionRequest {
  title: string;
  /** YYYY-MM-DD, local gym date; not in the future. */
  performedOn: string;
  durationMinutes?: number | null;
  notes?: string | null;
  exercises: WorkoutExerciseInput[];
}
export type UpdateWorkoutSessionRequest = CreateWorkoutSessionRequest;

export interface WorkoutSetDto {
  id: string;
  setNumber: number;
  setType: WorkoutSetType;
  reps: number;
  weightKg: number;
  volume: number;
  estimated1RM: number | null;
  isPR: boolean;
}
export interface WorkoutExerciseDto {
  id: string;
  exerciseName: string;
  orderIndex: number;
  sets: WorkoutSetDto[];
}
export interface WorkoutSessionDto {
  id: string;
  title: string;
  performedOn: string;
  durationMinutes: number | null;
  notes: string | null;
  totalVolume: number;
  createdAt: string;
  updatedAt: string;
  exercises: WorkoutExerciseDto[];
  /** Records this session currently holds as a new PR (isPR = true). */
  newRecords: { exerciseName: string; oneRepMax: number }[];
}
export interface WorkoutMonthStatsDto {
  /** YYYY-MM in Asia/Ho_Chi_Minh. */
  month: string;
  sessionsThisMonth: number;
  totalMinutesThisMonth: number;
  totalVolumeThisMonth: number;
  /** Consecutive training days ending today (or yesterday). */
  currentStreakDays: number;
}
export interface WorkoutHistoryResponse {
  items: WorkoutSessionDto[];
  total: number;
  page: number;
  pageSize: number;
  stats: WorkoutMonthStatsDto;
}
export interface PersonalRecordDto {
  exerciseName: string;
  oneRepMax: number;
  weightKg: number;
  reps: number;
  achievedOn: string;
  sessionId: string | null;
  /** BR04: first-ever best for the exercise, not yet beaten. */
  isBaseline: boolean;
  /** True once a later session beat the baseline. */
  isPR: boolean;
  updatedAt: string;
}
