/** Resolve at app startup; no saved device-specific Wi-Fi address is required. */
export function resolveApiBaseUrl({
  explicitUrl,
  platform,
  expoHost,
  browserHost,
}: {
  explicitUrl?: string;
  platform: string;
  expoHost?: string | null;
  browserHost?: string;
}) {
  if (explicitUrl?.trim()) return explicitUrl.trim().replace(/\/+$/, "");
  const loopback = (host: string) =>
    ["localhost", "127.0.0.1", "[::1]"].includes(host);
  const address = (host: string) =>
    `http://${loopback(host) ? "127.0.0.1" : host}:3000`;
  if (platform === "web" && browserHost) return address(browserHost);
  if (expoHost) {
    try {
      const hostname = new URL(
        expoHost.includes("://") ? expoHost : `http://${expoHost}`,
      ).hostname;
      if (hostname && !loopback(hostname)) return address(hostname);
    } catch {
      /* Malformed/absent Expo host: use the simulator default below. */
    }
  }
  return platform === "android"
    ? "http://10.0.2.2:3000"
    : "http://127.0.0.1:3000";
}
