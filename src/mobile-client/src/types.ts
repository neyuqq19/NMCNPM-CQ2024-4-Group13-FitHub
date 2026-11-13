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

export type MembershipState =
  | "NONE"
  | "ACTIVE"
  | "EXPIRED"
  | "SCHEDULED"
  | "PENDING_PAYMENT"
  | "FROZEN"
  | "CANCELLED";

export interface MyMembershipSummary {
  state: MembershipState;
  memberCode: string;
  membershipCode?: string;
  packageName?: string;
  durationMonths?: number;
  priceVND?: number;
  startsOn?: string; // DD/MM/YYYY
  endsInclusive?: string; // DD/MM/YYYY (endsBefore - 1 day per BR04 UC05)
  daysRemaining?: number;
  daysUsed?: number;
  totalDays?: number;
  sessionsThisMonth?: number;
  allowedHoursLabel?: string;
}

export interface MobileSession {
  user: CurrentUser;
  accessToken: string;
  expiresAt: string;
  membership: MyMembershipSummary;
  source: "API";
}

export type ScreenId =
  | "00_LOGIN"
  | "01_HOME"
  | "02_MY_PACKAGE"
  | "03_QR_CODE"
  | "04_CHECKIN_OK"
  | "05_EXPIRED"
  | "06_COOLDOWN"
  | "07_QR_EXPIRED"
  | "08_VERIFYING"
  | "09_PROFILE"
  | "10_WORKOUT_LOG"
  | "10_TRAINERS"
  | "11_NOTIFICATIONS";
