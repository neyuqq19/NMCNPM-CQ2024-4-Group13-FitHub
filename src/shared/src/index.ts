export * from "./constants";
export * from "./working-slots";

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
  ptSessionsIncluded?: number;
  isActive?: boolean;
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
  | "PENDING_VERIFY"
  | "ACTIVE"
  | "LOCKED"
  | "DEACTIVATED";
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
  durationMonths?: number;
  ptSessionsRemaining?: number;
}
export interface PackagePurchaseDto extends MembershipSummary {
  registeredAt: string;
  price: number;
  payment: {
    code: string;
    amount: number;
    method: string;
    status: PaymentStatus;
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

// ===== UC15 — Thanh toán gói tập (SAD 4.4, UCSpec 3.5.1) =====

export type PaymentStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "FAILED";
export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "VNPAY";
/** Phương thức Admin được chọn khi thu tại quầy. */
export type CounterPaymentMethod = "CASH" | "BANK_TRANSFER";
/** NEEDS_REVIEW: đã thu tiền nhưng chưa cấp được quyền lợi; NONE: đã đối soát, quyết định không cấp. */
export type BenefitStatus = "GRANTED" | "NEEDS_REVIEW" | "NONE";
/** MISMATCHED: cần Admin đối soát; RECONCILED: đã xử lý. */
export type ReconciliationStatus = "NONE" | "MISMATCHED" | "RECONCILED";
export type InvoiceStatus = "ISSUED" | "FAILED";

export interface InvoiceReceiptDto {
  buyerName: string;
  memberCode: string;
  packageName: string;
  period: string;
  amount: number;
  method: string;
  paidAt: string;
  cashier: string | null;
  paymentCode: string;
}
export interface InvoiceDto {
  id: string;
  /** INV-YYYYMMDD-NNNN; null khi phát hành lỗi. */
  code: string | null;
  status: InvoiceStatus;
  issuedAt: string | null;
  errorMessage: string | null;
  /** Chế độ SIMULATED: biên lai dựng từ dữ liệu giao dịch, không có file PDF. */
  pdfUrl: string | null;
  receipt: InvoiceReceiptDto | null;
}

export interface PaymentDetailDto {
  id: string;
  code: string;
  status: PaymentStatus;
  amount: number;
  method: string;
  createdAt: string;
  confirmedAt: string | null;
  confirmedBy: string | null;
  isTest: boolean;
  benefitStatus: BenefitStatus;
  reconciliationStatus: ReconciliationStatus;
  transferReference: string | null;
  /** Hạn của URL VNPay đang mở; null khi chưa có hoặc đã chốt. */
  onlineExpiresAt: string | null;
  invoice: InvoiceDto | null;
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
  /** Mặc định CASH. */
  method?: CounterPaymentMethod;
  /** Tham chiếu chuyển khoản tại quầy (tối đa 100 ký tự). */
  reference?: string;
}
export interface CreateVNPayUrlResponse {
  paymentId: string;
  paymentCode: string;
  paymentUrl: string;
  txnRef: string;
  amount: number;
  expiresAt: string;
  /** SIMULATED: chưa có tài khoản sandbox, dùng giả lập IPN đã ký để thử luồng. */
  mode: "SANDBOX" | "SIMULATED";
}
export interface SimulateVNPayRequest {
  result: "SUCCESS" | "FAILED" | "BAD_SIGNATURE";
}
export interface ReconcilePaymentRequest {
  /** GRANT: cấp lại quyền lợi gói; DISMISS: đã xử lý ngoài hệ thống (ví dụ hoàn tiền). */
  action: "GRANT" | "DISMISS";
  note?: string;
}
/** Khoản thanh toán của chính hội viên (mobile). */
export interface MyPaymentDto {
  id: string;
  code: string;
  status: PaymentStatus;
  amount: number;
  method: string;
  createdAt: string;
  confirmedAt: string | null;
  onlineExpiresAt: string | null;
  packageName: string;
  membershipStatus: string;
  startsOn: string;
  endsBefore: string;
  benefitStatus: BenefitStatus;
  invoice: InvoiceDto | null;
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
export const WORKOUT_SET_TYPES: readonly WorkoutSetType[] = [
  "W",
  "R",
  "D",
  "F",
];
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

export type FreezeStatus = "ACTIVE" | "ENDED";

export interface FreezePeriodDto {
  id: string;
  membershipId: string;
  startsOn: string;
  endsBefore: string;
  days: number;
  reason: string;
  status: FreezeStatus;
  endedAt: string | null;
  createdAt: string;
}

export interface CreatePackageRequest {
  code: string;
  name: string;
  durationMonths: 1 | 3 | 6 | 12;
  price: number;
  accessWindow?: "REGULAR" | "OFF_PEAK";
  grantsGymAccess?: boolean;
  ptSessionsIncluded?: number;
  isActive?: boolean;
}

export interface UpdatePackageRequest {
  name?: string;
  durationMonths?: 1 | 3 | 6 | 12;
  price?: number;
  accessWindow?: "REGULAR" | "OFF_PEAK";
  grantsGymAccess?: boolean;
  ptSessionsIncluded?: number;
  isActive?: boolean;
}

export interface FreezeMembershipRequest {
  days: number;
  reason: string;
  startsOn?: string;
}

export interface FreezeMembershipResponse {
  membership: MembershipSummary & {
    durationMonths: number;
    ptSessionsRemaining: number;
    frozenDaysUsed: number;
    freezePeriods: FreezePeriodDto[];
  };
  shiftedScheduledMembership: MembershipSummary | null;
}

export interface MyMembershipDetailDto {
  hasProfile: boolean;
  memberCode: string | null;
  activeMembership:
    | (MembershipSummary & {
        durationMonths: number;
        accessWindow: "REGULAR" | "OFF_PEAK";
        grantsGymAccess: boolean;
        ptSessionsSnapshot: number;
        ptSessionsRemaining: number;
        frozenDaysUsed: number;
        freezePeriods: FreezePeriodDto[];
      })
    | null;
  scheduledMembership:
    | (MembershipSummary & {
        durationMonths: number;
        accessWindow: "REGULAR" | "OFF_PEAK";
        grantsGymAccess: boolean;
        ptSessionsSnapshot: number;
        ptSessionsRemaining: number;
      })
    | null;
  recentMemberships: (MembershipSummary & {
    durationMonths: number;
    price: number;
  })[];
}

export type EquipmentCategory =
  | "CARDIO"
  | "STRENGTH"
  | "FREE_WEIGHT"
  | "FUNCTIONAL";

export type EquipmentStatus = "OPERATIONAL" | "OUT_OF_ORDER" | "RETIRED";

export type IncidentSeverity = "LOW" | "MEDIUM" | "HIGH";

export type IncidentStatus = "OPEN" | "RESOLVED" | "REJECTED";

export interface EquipmentIncidentDto {
  id: string;
  equipmentId: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  resolutionNote: string | null;
  reportedBy: string | null;
  resolvedBy: string | null;
  reportedAt: string;
  resolvedAt: string | null;
}

export interface EquipmentHistoryDto {
  id: string;
  equipmentId: string;
  action: string;
  fromStatus: EquipmentStatus | null;
  toStatus: EquipmentStatus;
  note: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface EquipmentDto {
  id: string;
  code: string;
  name: string;
  category: EquipmentCategory;
  zone: string;
  status: EquipmentStatus;
  qrCodePayload: string;
  purchasedAt: string | null;
  warrantyUntil: string | null;
  notes: string | null;
  openIncident: EquipmentIncidentDto | null;
  createdAt: string;
  updatedAt: string;
}

export interface EquipmentOverviewDto {
  total: number;
  operational: number;
  outOfOrder: number;
  retired: number;
}

export interface EquipmentPageDto {
  items: EquipmentDto[];
  overview: EquipmentOverviewDto;
  zones: string[];
}

export interface EquipmentDetailDto extends EquipmentDto {
  incidents: EquipmentIncidentDto[];
  history: EquipmentHistoryDto[];
}

export interface CreateEquipmentRequest {
  name: string;
  category: EquipmentCategory;
  zone: string;
  purchasedAt?: string | null;
  warrantyUntil?: string | null;
  notes?: string | null;
}

export interface UpdateEquipmentRequest {
  name?: string;
  zone?: string;
  purchasedAt?: string | null;
  warrantyUntil?: string | null;
  notes?: string | null;
}

export interface CreateIncidentRequest {
  description: string;
  severity?: IncidentSeverity;
}

export interface ResolveMaintenanceRequest {
  resolutionNote: string;
  nextStatus?: "OPERATIONAL" | "RETIRED";
}

export interface RetireEquipmentRequest {
  reason?: string | null;
}

export type TrainerWorkStatus = "ACTIVE" | "ON_LEAVE";

export interface TrainerSummaryDto {
  workStatus: TrainerWorkStatus;
  id: string;
  userId: string;
  trainerCode: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  accountStatus: AccountStatus;
  avatarUrl: string | null;
  specialties: string[];
  experienceYears: number;
  certificationCount: number;
}

export interface TrainerListResponse {
  items: TrainerSummaryDto[];
}

export interface TrainerCertificationDto {
  id: string;
  name: string;
  issuer: string;
  issuedAt: string;
  credentialUrl: string | null;
}

export interface TrainerProfileDto extends TrainerSummaryDto {
  bio: string;
  version: number;
  certifications: TrainerCertificationDto[];
}

export interface UpdateTrainerProfileRequest {
  workStatus?: TrainerWorkStatus;
  bio: string;
  specialties: string[];
  experienceYears: number;
  avatarUrl?: string | null;
  version: number;
}

export interface CreateCertificationRequest {
  name: string;
  issuer: string;
  issuedAt: string;
  credentialUrl?: string | null;
  version: number;
}

// ===== UC16 - Thông báo nhắc lịch / nhắc hạn gói tập =====
export type NotificationType = "PT_REMINDER" | "PACKAGE_EXPIRY";
export type ReminderType =
  | "PT_REMINDER_24H"
  | "PT_REMINDER_2H"
  | "PACKAGE_EXPIRY_7D"
  | "PACKAGE_EXPIRY_3D";
// Màn hình mở khi bấm vào thông báo (điều hướng ngữ cảnh).
export type NotificationTargetScreen = "PT_APPOINTMENTS" | "MY_PACKAGE";
export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  targetScreen: NotificationTargetScreen;
  sourceId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}
export interface NotificationListResponse {
  items: NotificationDto[];
  // Số thông báo chưa đọc của người dùng, không phụ thuộc bộ lọc đang chọn.
  unreadCount: number;
  total: number;
  page: number;
  pageSize: number;
}
export interface NotificationReadResponse {
  notification: NotificationDto;
  unreadCount: number;
}
export interface MarkAllReadResponse {
  updated: number;
  unreadCount: number;
}
export interface RegisterPushDeviceRequest {
  deviceId: string;
  platform: Platform;
  pushToken: string;
  enabled?: boolean;
}
export interface PushDeviceDto {
  id: string;
  deviceId: string;
  platform: Platform;
  enabled: boolean;
}
export interface DispatchDueRequest {
  // Chỉ dùng để chạy thử: coi như "bây giờ" là thời điểm này.
  now?: string;
  // Chỉ dùng để chạy thử: ép PushAdapter báo lỗi (E1).
  simulatePushFailure?: boolean;
}
export interface DispatchDueResult {
  due: number;
  sent: number;
  cancelled: number;
  skipped: number;
  deferred: number;
  pushSent: number;
  pushFailed: number;
}