import type {
  ApiErrorBody,
  CreateMemberRequest,
  CreatePackageRequest,
  CurrentUser,
  FreezeMembershipRequest,
  FreezeMembershipResponse,
  FreezePeriodDto,
  LoginRequest,
  LoginResponse,
  MemberDetailDto,
  MemberPage,
  MemberOverviewDto,
  PackageDto,
  UpdateMemberRequest,
  UpdatePackageRequest,
} from "@fithub/contracts";
const API_BASE =
  (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_API_BASE_URL || "http://127.0.0.1:3000";
export class ApiError extends Error {
  constructor(
    public status: number,
    public body: ApiErrorBody,
  ) {
    super(body.message);
  }
}
export async function fetchFromApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = sessionStorage.getItem("fithub_token");
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
      ...options,
      headers,
      signal: options.signal || AbortSignal.timeout(12000),
    });
  } catch {
    throw new ApiError(0, {
      code: "NETWORK_ERROR",
      message: "Không kết nối được máy chủ. Kiểm tra kết nối rồi thử lại.",
    });
  }
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !path.endsWith("/login"))
      window.dispatchEvent(new Event("fithub:session-expired"));
    throw new ApiError(response.status, {
      ...body,
      message: body.message || "Không thể thực hiện yêu cầu.",
    });
  }
  return body as T;
}
export const apiService = {
  login: (body: LoginRequest) =>
    fetchFromApi<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  me: () => fetchFromApi<CurrentUser>("/api/auth/me"),
  logout: () => fetchFromApi("/api/auth/logout", { method: "POST" }),
  getMembers: (query = "") =>
    fetchFromApi<MemberPage>(`/api/members${query ? `?${query}` : ""}`),
  getMemberOverview: () =>
    fetchFromApi<MemberOverviewDto>("/api/members/overview"),
  getMember: (id: string) =>
    fetchFromApi<MemberDetailDto>(`/api/members/${id}`),
  createMember: (body: CreateMemberRequest) =>
    fetchFromApi<MemberDetailDto>("/api/members", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateMember: (id: string, body: UpdateMemberRequest) =>
    fetchFromApi<MemberDetailDto>(`/api/members/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deactivateMember: (id: string, version: number, reason: string) =>
    fetchFromApi<MemberDetailDto>(`/api/members/${id}/deactivate`, {
      method: "POST",
      body: JSON.stringify({ version, reason }),
    }),
  getPackages: (includeInactive = false) =>
    fetchFromApi<PackageDto[]>(
      `/api/packages${includeInactive ? "?includeInactive=true" : ""}`,
    ),
  createPackage: (body: CreatePackageRequest) =>
    fetchFromApi<PackageDto>("/api/packages", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updatePackage: (id: string, body: UpdatePackageRequest) =>
    fetchFromApi<PackageDto>(`/api/packages/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  freezeMembership: (id: string, body: FreezeMembershipRequest) =>
    fetchFromApi<FreezeMembershipResponse>(`/api/memberships/${id}/freeze`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  unfreezeMembership: (id: string) =>
    fetchFromApi<FreezeMembershipResponse>(`/api/memberships/${id}/unfreeze`, {
      method: "POST",
    }),
  getMembershipFreezes: (id: string) =>
    fetchFromApi<FreezePeriodDto[]>(`/api/memberships/${id}/freezes`),
  getHealth: () => fetchFromApi("/api/health"),
};
