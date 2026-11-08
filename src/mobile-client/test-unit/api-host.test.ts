import test from "node:test";
import assert from "node:assert/strict";
import { resolveApiBaseUrl } from "../src/apiBaseUrl";
test("physical devices follow Expo LAN host after DHCP/Wi-Fi IP changes", () => {
  for (const platform of ["ios", "android"]) {
    assert.equal(
      resolveApiBaseUrl({ platform, expoHost: "192.168.1.4:8081" }),
      "http://192.168.1.4:3000",
    );
    assert.equal(
      resolveApiBaseUrl({ platform, expoHost: "192.168.0.25:8081" }),
      "http://192.168.0.25:3000",
    );
  }
});
test("web uses the hostname it was opened on; localhost resolves to IPv4", () => {
  assert.equal(
    resolveApiBaseUrl({
      platform: "web",
      browserHost: "192.168.1.4",
      expoHost: "192.168.0.25:8081",
    }),
    "http://192.168.1.4:3000",
  );
  assert.equal(
    resolveApiBaseUrl({ platform: "web", browserHost: "localhost" }),
    "http://127.0.0.1:3000",
  );
});
test("explicit production/custom backend still overrides local discovery", () => {
  assert.equal(
    resolveApiBaseUrl({
      platform: "ios",
      expoHost: "192.168.1.4:8081",
      explicitUrl: " https://api.example.com/ ",
    }),
    "https://api.example.com",
  );
  assert.equal(
    resolveApiBaseUrl({
      platform: "ios",
      expoHost: "192.168.1.4:8081",
      explicitUrl: " ",
    }),
    "http://192.168.1.4:3000",
  );
});
test("URI and IPv6 hosts parse without treating the scheme as the hostname", () => {
  assert.equal(
    resolveApiBaseUrl({ platform: "ios", expoHost: "exp://192.168.1.4:8081" }),
    "http://192.168.1.4:3000",
  );
  assert.equal(
    resolveApiBaseUrl({ platform: "ios", expoHost: "[fd00::1234]:8081" }),
    "http://[fd00::1234]:3000",
  );
});
test("missing or invalid host uses emulator defaults rather than an old LAN IP", () => {
  assert.equal(
    resolveApiBaseUrl({ platform: "android" }),
    "http://10.0.2.2:3000",
  );
  assert.equal(
    resolveApiBaseUrl({ platform: "ios", expoHost: "bad host" }),
    "http://127.0.0.1:3000",
  );
});
