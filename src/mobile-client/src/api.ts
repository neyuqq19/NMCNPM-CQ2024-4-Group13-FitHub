import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import Constants from "expo-constants";
import { resolveApiBaseUrl } from "./apiBaseUrl";
import { deviceId } from "./session";
import type {
  CurrentUser,
  LoginResponse,
  MobileSession,
  MyMembershipSummary,
} from "./types";
export type EmailVerification = {
  verificationId: string;
  emailMasked: string;
  expiresAt: string;
  resendAt: string;
  deliveryStatus: "SENDING" | "SENT" | "FAILED";
};
export class MobileApiError extends Error {
  constructor(
    public status: number,
    public body: {
      code?: string;
      message: string;
      retryAt?: string;
      verification?: EmailVerification;
    },
  ) {
    super(body.message);
  }
}
export function getDefaultApiBaseUrl() {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ||
    (Constants as any).manifest?.debuggerHost;

  const browser = globalThis as unknown as { location?: { hostname: string } };
  return resolveApiBaseUrl({
    explicitUrl: process.env.EXPO_PUBLIC_API_URL,
    platform: Platform.OS,
    expoHost: hostUri,
    browserHost: browser.location?.hostname,
  });
}
export const DEFAULT_API_BASE_URL = getDefaultApiBaseUrl();
let onExpired: () => void = () => {};
export function setSessionExpiredHandler(callback: () => void) {
  onExpired = callback;
}
export async function mobileRequest<T>(
  baseUrl: string,
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    let response: Response;
    try {
      response = await fetch(`${baseUrl.trim().replace(/\/+$/, "")}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers,
        },
        signal: controller.signal,
      });
    } catch {
      throw new MobileApiError(0, {
        code: "NETWORK_ERROR",
        message:
          "Không kết nối được máy chủ. Vui lòng kiểm tra kết nối và thử lại.",
      });
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && token) onExpired();
      throw new MobileApiError(response.status, {
        ...body,
        message: Array.isArray(body.message)
          ? body.message.join("; ")
          : body.message || "Không thể hoàn tất yêu cầu.",
      });
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}
export async function loginMobile(
  baseUrl: string,
  identifier: string,
  password: string,
): Promise<MobileSession> {
  const requestId = Crypto.randomUUID();
  try {
    const data = await mobileRequest<
      LoginResponse & { membership: MyMembershipSummary }
    >(baseUrl, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        identifier,
        password,
        platform: "MOBILE",
        deviceId: await deviceId(),
        requestId,
      }),
    });
    if (data.user.role !== "MEMBER" || !data.accessToken) {
      if (data.accessToken) await logoutMobile(baseUrl, data.accessToken);
      throw new Error("Ứng dụng này dành cho tài khoản hội viên.");
    }
    const membership =
      data.membership ||
      (await mobileRequest<MyMembershipSummary>(
        baseUrl,
        "/api/auth/membership",
        {},
        data.accessToken,
      ));
    return {
      ...data,
      accessToken: data.accessToken,
      membership,
      source: "API",
    };
  } catch (e) {
    throw e;
  }
}
export async function restoreMobileSession(
  baseUrl: string,
  token: string,
): Promise<MobileSession> {
  const user = await mobileRequest<CurrentUser>(
    baseUrl,
    "/api/auth/me",
    {},
    token,
  );
  if (user.role !== "MEMBER")
    throw new MobileApiError(401, {
      message: "Tài khoản không được dùng ứng dụng hội viên.",
    });
  const membership = await mobileRequest<MyMembershipSummary>(
    baseUrl,
    "/api/auth/membership",
    {},
    token,
  );
  return { user, accessToken: token, expiresAt: "", membership, source: "API" };
}
export const refreshMyMembership = (baseUrl: string, session: MobileSession) =>
  mobileRequest<MyMembershipSummary>(
    baseUrl,
    "/api/auth/membership",
    {},
    session.accessToken,
  );
export const logoutMobile = (baseUrl: string, token: string) =>
  mobileRequest(baseUrl, "/api/auth/logout", { method: "POST" }, token);
export const registerMobile = (
  baseUrl: string,
  email: string,
  password: string,
  confirmPassword: string,
  displayName?: string,
) =>
  mobileRequest<EmailVerification>(baseUrl, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, confirmPassword, displayName }),
  });
export const resendEmailOtp = (baseUrl: string, verificationId: string) =>
  mobileRequest<EmailVerification>(baseUrl, "/api/auth/resend-email-otp", {
    method: "POST",
    body: JSON.stringify({ verificationId }),
  });
export const verifyEmailOtp = (
  baseUrl: string,
  verificationId: string,
  code: string,
  password: string,
  confirmPassword: string,
) =>
  mobileRequest<{ verified: boolean; message: string }>(
    baseUrl,
    "/api/auth/verify-email",
    {
      method: "POST",
      body: JSON.stringify({ verificationId, code, password, confirmPassword }),
    },
  );
