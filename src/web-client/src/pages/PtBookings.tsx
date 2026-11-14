import { useState } from "react";
import type {
  AppointmentActionResponse,
  AppointmentDto,
  AppointmentPageDto,
  AppointmentStatus,
  PtSessionOutcome,
  Role,
} from "@fithub/contracts";
import { Badge, Empty, Notice, PageHeading } from "../components";
import { useResource } from "../hooks/useResource";
import { fetchFromApi } from "../services/api.service";
import "./PtBookings.css";

const PT_COMPENSATION_HOURS = 6;
const statusLabel: Record<AppointmentStatus, string> = {
  CONFIRMED: "Đã xác nhận",
  CANCELLED_BY_MEMBER: "Hội viên đã hủy",
  CANCELLED_BY_PT: "PT đã hủy",
  NO_SHOW: "Vắng mặt",
  COMPLETED: "Đã hoàn thành",
};
const statusTone: Record<AppointmentStatus, "success" | "warning" | "neutral" | "danger"> = {
  CONFIRMED: "success",
  CANCELLED_BY_MEMBER: "neutral",
  CANCELLED_BY_PT: "warning",
  NO_SHOW: "danger",
  COMPLETED: "neutral",
};
const sessionLabel = { HELD: "Đang giữ", CONSUMED: "Đã trừ", REFUNDED: "Đã hoàn" } as const;
const outcomeText: Record<PtSessionOutcome, string> = {
  REFUND: "Đã hoàn lại 1 buổi PT cho hội viên.",
  CONSUME: "Đã trừ 1 buổi PT của hội viên.",
  REFUND_WITH_COMPENSATION:
    "Đã hoàn lại 1 buổi PT và cộng đền bù thêm 1 buổi PT cho hội viên.",
};
const dateTime = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const day = (iso: string) => iso.split("-").reverse().join("/");
const range = (a: AppointmentDto) =>
  `${dateTime.format(new Date(a.startTime))} – ${dateTime.format(new Date(a.endTime))}`;

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : "Không thực hiện được thao tác.";
}

export function PtBookingsPage({ role }: { role: Role }) {
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const query = new URLSearchParams();
  if (status) query.set("status", status);
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  const qs = query.toString();
  const { data, error, loading, reload } = useResource(`pt-bookings:${qs}`, () =>
    fetchFromApi<AppointmentPageDto>(`/api/appointments${qs ? `?${qs}` : ""}`),
  );
  const [cancelling, setCancelling] = useState<AppointmentDto | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");

  async function run(path: string, body?: unknown) {
    setBusy(true);
    setMessage("");
    setFailure("");
    try {
      const res = await fetchFromApi<AppointmentActionResponse>(path, {
        method: "POST",
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      setMessage(
        `${res.appointment.code}: ${res.ptSessionOutcome ? outcomeText[res.ptSessionOutcome] : "Đã cập nhật lịch hẹn."}`,
      );
      setCancelling(null);
      setReason("");
      reload();
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const now = Date.now();
  const hoursLeft = cancelling
    ? (new Date(cancelling.startTime).getTime() - now) / 3600_000
    : 0;

  return (
    <>
      <PageHeading
        title="Lịch hẹn PT"
        section="Lịch hẹn PT"
        description={
          role === "TRAINER"
            ? "Các buổi tập 1-1 hội viên đã đặt với bạn."
            : "Quản lý lịch hẹn 1-1, xử lý hủy lịch và xác minh hội viên vắng mặt."
        }
        action={
          <button className="button outline" disabled={loading} onClick={reload}>
            Làm mới
          </button>
        }
      />
      {message && <Notice>{message}</Notice>}
      {failure && <Notice error>{failure}</Notice>}
      <div className="search-bar pt-filters">
        <select aria-label="Trạng thái lịch hẹn" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          {(Object.keys(statusLabel) as AppointmentStatus[]).map((s) => (
            <option key={s} value={s}>
              {statusLabel[s]}
            </option>
          ))}
        </select>
        <label>
          Từ ngày <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Đến ngày <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      <section className="panel">
        <h2>Danh sách lịch hẹn</h2>
        {loading ? (
          <p>Đang tải lịch hẹn…</p>
        ) : error || !data ? (
          <Notice error>{error || "Không tải được lịch hẹn."}</Notice>
        ) : data.items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Mã</th>
                  <th>Hội viên</th>
                  <th>PT</th>
                  <th>Ngày</th>
                  <th>Giờ</th>
                  <th>Trạng thái</th>
                  <th>Buổi PT</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((a) => {
                  const started = new Date(a.startTime).getTime() <= now;
                  const ended = new Date(a.endTime).getTime() <= now;
                  const confirmed = a.status === "CONFIRMED";
                  return (
                    <tr key={a.id}>
                      <td>{a.code}</td>
                      <td>
                        {a.member.displayName} <small>({a.member.memberCode})</small>
                      </td>
                      <td>{a.trainer.displayName}</td>
                      <td>{day(a.workDate)}</td>
                      <td>{range(a)}</td>
                      <td>
                        <Badge tone={statusTone[a.status]}>{statusLabel[a.status]}</Badge>
                        {a.compensationGranted && <small className="pt-note"> · đã đền bù +1 buổi</small>}
                      </td>
                      <td>{sessionLabel[a.ptSessionState]}</td>
                      <td className="pt-actions">
                        {confirmed && !started && (
                          <button className="button outline" disabled={busy} onClick={() => setCancelling(a)}>
                            PT hủy lịch
                          </button>
                        )}
                        {confirmed && ended && role === "ADMIN" && (
                          <button
                            className="button outline"
                            disabled={busy}
                            onClick={() => run(`/api/appointments/${a.id}/verify-no-show`)}
                          >
                            Xác minh vắng mặt (NO_SHOW)
                          </button>
                        )}
                        {a.cancelReason && !confirmed && <small>{a.cancelReason}</small>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Chưa có lịch hẹn" description="Không có lịch hẹn nào khớp bộ lọc hiện tại." />
        )}
      </section>
      {cancelling && (
        <div className="pt-modal-backdrop">
          <div className="panel pt-modal" role="dialog" aria-modal="true" aria-labelledby="pt-cancel-title">
            <h2 id="pt-cancel-title">
              Hủy lịch {cancelling.code} · {cancelling.member.displayName}
            </h2>
            <p>
              {day(cancelling.workDate)} · {range(cancelling)}
            </p>
            {hoursLeft < PT_COMPENSATION_HOURS ? (
              <Notice error>
                Hủy lịch sát giờ (&lt; 6 tiếng): hội viên sẽ được hoàn lại buổi tập và được cộng đền bù thêm +1 buổi PT.
              </Notice>
            ) : (
              <Notice>Hội viên sẽ được hoàn lại 1 buổi PT.</Notice>
            )}
            <label className="field">
              Lý do hủy (bắt buộc)
              <textarea
                value={reason}
                maxLength={500}
                rows={3}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <div className="pt-modal-actions">
              <button className="button outline" disabled={busy} onClick={() => setCancelling(null)}>
                Đóng
              </button>
              <button
                className="button primary"
                disabled={busy || !reason.trim()}
                onClick={() => run(`/api/appointments/${cancelling.id}/cancel-by-pt`, { reason: reason.trim() })}
              >
                Xác nhận hủy lịch
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
