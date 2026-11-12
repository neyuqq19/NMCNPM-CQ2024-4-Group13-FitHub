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
