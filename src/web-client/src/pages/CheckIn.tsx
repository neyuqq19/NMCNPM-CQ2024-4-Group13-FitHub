import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import type {
  CheckInResult,
  CheckInScannerDto,
  ScanCheckInRequest,
} from "@fithub/contracts";
import { PageHeading, Notice } from "../components";
import { ApiError, fetchFromApi } from "../services/api.service";
import { createQrReader, QrReaderLoadError } from "../services/qr-reader";

export function CheckInPage() {
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const pending = useRef<ScanCheckInRequest | null>(null);
  const busyRef = useRef(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState("");
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const stop = () => {
    generation.current++;
    controls.current?.stop();
    controls.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setActive(false);
  };
  useEffect(
    () => () => {
      generation.current++;
      controls.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, []);
  async function submit(body: ScanCheckInRequest, reconcile = false) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      let response: CheckInResult | undefined;
      if (reconcile) {
        try {
          response = await fetchFromApi<CheckInResult>(
            `/api/check-ins/transactions/${body.requestId}`,
          );
        } catch (e) {
          if (!(e instanceof ApiError) || e.status !== 404) throw e;
        }
      }
      response ||= await fetchFromApi<CheckInResult>("/api/check-ins/scan", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setResult(response);
      pending.current = null;
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500)
        pending.current = null;
      setError(e instanceof Error ? e.message : "Không thể kiểm tra mã.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function start() {
    stop();
    setLoadFailed(false);
    setError("");
    setResult(null);
    setBusy(true);
    const version = generation.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Camera cần HTTPS hoặc localhost. Hãy mở trang bằng kết nối phù hợp.",
        );
      let id = localStorage.getItem("fithub_scanner_device");
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem("fithub_scanner_device", id);
      }
      const scanner = await fetchFromApi<CheckInScannerDto>(
        "/api/check-ins/scanners",
        {
          method: "POST",
          body: JSON.stringify({ deviceId: id, label: "Camera quầy lễ tân" }),
        },
      );
      if (version !== generation.current) return;
      const reader = await createQrReader();
      if (version !== generation.current) return;
      // Use the same high-resolution stream for permission, preview and decoding.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          ...(device
            ? { deviceId: { exact: device } }
            : { facingMode: { ideal: "environment" } }),
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 15, max: 30 },
        },
        audio: false,
      });
      if (version !== generation.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const cameras = (await navigator.mediaDevices.enumerateDevices()).filter(
        (d) => d.kind === "videoinput",
      );
      setDevices(cameras);
      if (!cameras.length)
        throw new Error(
          "Không tìm thấy camera. Hãy kết nối camera rồi thử lại.",
        );
      let captured = false;
      const current = await reader.decodeFromStream(
        stream,
        video.current!,
        (decoded, _error, scannerControls) => {
          if (!decoded || captured || version !== generation.current) return;
          captured = true;
          scannerControls.stop();
          stop();
          const body = {
            scannerId: scanner.id,
            requestId: crypto.randomUUID(),
            payload: decoded.getText(),
          };
          pending.current = body;
          void submit(body);
        },
      );
      if (captured || version !== generation.current) current.stop();
      else {
        controls.current = current;
        setActive(true);
      }
    } catch (e) {
      stop();
      setLoadFailed(e instanceof QrReaderLoadError);
      const name = e instanceof Error ? e.name : "";
      setError(
        name === "NotAllowedError"
          ? "Chưa được phép dùng camera. Cho phép camera trong trình duyệt rồi thử lại."
          : name === "NotFoundError"
            ? "Không tìm thấy camera. Hãy kết nối camera rồi thử lại."
            : name === "NotReadableError"
              ? "Camera đang được ứng dụng khác sử dụng. Đóng ứng dụng đó rồi thử lại."
              : e instanceof Error
                ? e.message
                : "Không thể mở camera.",
      );
    } finally {
      if (!busyRef.current) setBusy(false);
    }
  }
  return (
    <>
      <PageHeading section="Quầy lễ tân" title="Check-in hội viên" />
      <section className="panel checkin-panel">
        <p>Quét mã QR trên mobile để kiểm tra quyền vào tập.</p>
        <div className="checkin-toolbar">
          <label className="field">
            Camera
            <select
              aria-label="Camera"
              value={device}
              disabled={active || busy}
              onChange={(e) => setDevice(e.target.value)}
            >
              <option value="">Camera mặc định</option>
              {devices.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
          {active ? (
            <button className="button" onClick={stop}>
              Tắt camera
            </button>
          ) : (
            <button
              className="button primary"
              disabled={busy || !!pending.current}
              onClick={() => void start()}
            >
              {busy ? "Đang xử lý…" : result ? "Quét tiếp" : "Bật camera"}
            </button>
          )}
        </div>
        <div className="checkin-camera">
          <video
            ref={video}
            muted
            playsInline
            aria-label="Khung camera quét QR"
          />
          {active && <div className="checkin-target" aria-hidden="true" />}
          {!active && <p>{busy ? "Đang kiểm tra…" : "Camera đang tắt"}</p>}
        </div>
        {active && (
          <p role="status">
            Đưa QR vào khung vuông, giữ điện thoại gần camera để mã đủ lớn và rõ
            nét. Tránh ánh sáng phản chiếu trên màn hình.
          </p>
        )}
        {!!error && <Notice error>{error}</Notice>}
        {loadFailed && (
          <button
            className="button outline"
            onClick={() => window.location.reload()}
          >
            Tải lại trang
          </button>
        )}
        {!!error && pending.current && (
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void submit(pending.current!, true)}
          >
            Kiểm tra lại kết quả
          </button>
        )}
        {pending.current && !result && !busy && (
          <p>Giữ lần quét này đến khi có kết quả để tránh ghi nhận lặp.</p>
        )}
        {result && (
          <div
            className={`checkin-result ${result.accepted ? "accepted" : "rejected"}`}
            role="status"
          >
            <h2>
              {result.accepted
                ? "Check-in thành công"
                : "Chưa được phép vào tập"}
            </h2>
            <p>{result.message}</p>
            {result.member && (
              <p>
                <strong>{result.member.displayName}</strong> ·{" "}
                {result.member.memberCode}
              </p>
            )}
            {result.membership && <p>Gói tập: {result.membership.name}</p>}
            <p>
              Thời gian:{" "}
              {new Date(result.checkedInAt || result.serverNow).toLocaleString(
                "vi-VN",
                { timeZone: "Asia/Ho_Chi_Minh" },
              )}
            </p>
            {result.retryAt && (
              <p>
                Có thể check-in tiếp từ{" "}
                {new Date(result.retryAt).toLocaleString("vi-VN", {
                  timeZone: "Asia/Ho_Chi_Minh",
                })}
                .
              </p>
            )}
          </div>
        )}
      </section>
    </>
  );
}
