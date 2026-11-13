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
