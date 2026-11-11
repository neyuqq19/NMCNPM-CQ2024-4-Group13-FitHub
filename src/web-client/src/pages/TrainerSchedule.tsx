import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  generateWorkingSlots,
  type RegisterAvailabilityResponse,
  type TrainerListResponse,
  type WorkingSlotDto,
} from "@fithub/contracts";
import { Notice, PageHeading } from "../components";
import { date, today } from "../data";
import { useResource } from "../hooks/useResource";
import { fetchFromApi } from "../services/api.service";

const clock = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const label = {
  OPEN: "Trống",
  BOOKED: "Đã có hội viên đặt",
  UNAVAILABLE: "Đã báo bận",
};

function times(slot: WorkingSlotDto) {
  return `${clock.format(new Date(slot.startTime))}–${clock.format(new Date(slot.endTime))}`;
}

function shift(day: string, offset: number) {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

function monday(value: string | null) {
  const day =
    value &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value))
      ? value
      : today();
  return shift(day, -(new Date(day + "T00:00:00Z").getUTCDay() + 6) % 7);
}

function failure(e: unknown) {
  return e instanceof Error ? e.message : "Không thể cập nhật lịch làm việc.";
}

export function AvailableSlots({ trainerId }: { trainerId: string }) {
  const [day, setDay] = useState(today);
  const resource = useResource(trainerId + day, () =>
    day
      ? fetchFromApi<WorkingSlotDto[]>(
          `/api/trainers/${encodeURIComponent(trainerId)}/available-slots?date=${day}`,
        )
      : Promise.resolve([]),
  );
  return (
    <section className="panel">
      <h2>Ca trống</h2>
      <label className="field">
        Tra cứu ca trống theo ngày
        <input
          type="date"
          value={day}
          min={today()}
          onChange={(e) => setDay(e.target.value)}
        />
      </label>
      {resource.loading && <p role="status">Đang tải ca trống…</p>}
      {resource.error && (
        <Notice error>
          {resource.error}{" "}
          <button className="button outline" onClick={resource.reload}>
            Thử lại
          </button>
        </Notice>
      )}
      {day &&
        resource.data &&
        (resource.data.length ? (
          <ul>
            {resource.data.map((slot) => (
              <li key={slot.id}>{times(slot)}</li>
            ))}
          </ul>
        ) : (
          <p>Không có ca trống trong ngày này.</p>
        ))}
    </section>
  );
}

function RegisterAvailability({ onSave }: { onSave: (day: string) => void }) {
  const [day, setDay] = useState(today);
  const [start, setStart] = useState("08:00"),
    [end, setEnd] = useState("12:00");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""),
    [error, setError] = useState("");
  let preview: ReturnType<typeof generateWorkingSlots> | undefined;
  let invalid = "";
  if (day && start && end) {
    try {
      preview = generateWorkingSlots(day, start, end);
      if (day < today()) invalid = "Ngày đăng ký không được ở trong quá khứ.";
    } catch (e) {
      invalid =
        e instanceof Error && e.message === "RANGE_TOO_SHORT"
          ? "Khung giờ đăng ký phải tối thiểu 60 phút để tạo được ít nhất 1 ca làm việc."
          : "Vui lòng chọn khung giờ hợp lệ trong khoảng 06:00–22:00.";
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!preview || invalid || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await fetchFromApi<RegisterAvailabilityResponse>(
        "/api/trainers/me/availability",
        {
          method: "POST",
          body: JSON.stringify({ date: day, startTime: start, endTime: end }),
        },
      );
      setMessage(
        `Đã tạo ${result.slots.length} ca làm việc. Số phút dư bỏ qua: ${result.discardedMinutes}.`,
      );
      onSave(day);
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>Đăng ký khung giờ rảnh</h2>
      <form
        onSubmit={save}
        onChange={() => {
          setError("");
          setMessage("");
        }}
      >
        <fieldset className="trainer-fields" disabled={busy}>
          <div className="slot-controls">
            <label className="field">
              Ngày đăng ký
              <input
                required
                type="date"
                min={today()}
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            </label>
            <label className="field">
              Từ giờ
              <input
                required
                type="time"
                min="06:00"
                max="22:00"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label className="field">
              Đến giờ
              <input
                required
                type="time"
                min="06:00"
                max="22:00"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </div>
          {invalid && <Notice error>{invalid}</Notice>}
          {preview && !invalid && (
            <section aria-label="Xem trước các ca">
              <h3>Xem trước các ca</h3>
              <ul className="slot-preview">
                {preview.slots.map((slot) => (
                  <li key={slot.startTime}>
                    {slot.startTime}–{slot.endTime}
                  </li>
                ))}
              </ul>
              <p>
                Nghỉ 15 phút giữa các ca. Bỏ qua {preview.discardedMinutes} phút
                dư cuối khung giờ.
              </p>
            </section>
          )}
          <button className="button primary" disabled={!preview || !!invalid}>
            Lưu lịch làm việc
          </button>
        </fieldset>
      </form>
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
    </section>
  );
}

type Change = { slot: WorkingSlotDto; action: "busy" | "reopen" | "delete" };
const actions = { busy: "Báo bận", reopen: "Mở lại ca", delete: "Xóa ca" };

function SlotConfirmation({
  change,
  close,
  saved,
}: {
  change: Change;
  close: () => void;
  saved: (message: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || (change.action === "busy" && !reason.trim())) return;
    setBusy(true);
    setError("");
    const path = `/api/trainers/me/slots/${encodeURIComponent(change.slot.id)}`;
    try {
      if (change.action === "delete")
        await fetchFromApi(path, { method: "DELETE" });
      else
        await fetchFromApi(path + "/availability", {
          method: "PATCH",
          body: JSON.stringify(
            change.action === "busy"
              ? { status: "UNAVAILABLE", reason: reason.trim() }
              : { status: "OPEN" },
          ),
        });
      saved(`Đã ${actions[change.action].toLocaleLowerCase("vi")}.`);
    } catch (e) {
      setError(failure(e));
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className="slot-dialog"
      aria-labelledby="slot-change-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <h2 id="slot-change-title">{actions[change.action]}</h2>
      <p>
        {date(change.slot.workDate)} · {times(change.slot)}
      </p>
      <form onSubmit={submit}>
        {change.action === "busy" && (
          <label className="field">
            Lý do báo bận
            <textarea
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        )}
        {change.action === "delete" && (
          <p>Ca làm việc này sẽ được xóa khỏi lịch.</p>
        )}
        {error && <Notice error>{error}</Notice>}
        <div className="slot-controls">
          <button
            className="button outline"
            type="button"
            disabled={busy}
            onClick={close}
          >
            Hủy
          </button>
          <button
            className="button primary"
            disabled={busy || (change.action === "busy" && !reason.trim())}
          >
            Xác nhận
          </button>
        </div>
      </form>
    </dialog>
  );
}

function WeekSchedule({
  trainerId,
  owner,
}: {
  trainerId: string;
  owner: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const start = monday(params.get("week"));
  const end = shift(start, 6);
  const [change, setChange] = useState<Change | null>(null);
  const [message, setMessage] = useState("");
  const resource = useResource(trainerId + start, () =>
    fetchFromApi<WorkingSlotDto[]>(
      `/api/trainers/${encodeURIComponent(trainerId)}/slots?from=${start}&to=${end}`,
    ),
  );
  function showWeek(day: string) {
    const next = new URLSearchParams(params);
    next.set("week", monday(day));
    setParams(next);
  }
  return (
    <>
      {owner && (
        <RegisterAvailability
          onSave={(day) => {
            setMessage("");
            if (monday(day) === start) resource.reload();
            else showWeek(day);
          }}
        />
      )}
      <section className="panel" aria-label="Lịch tuần">
        <h2>
          Lịch tuần {date(start)} – {date(end)}
        </h2>
        <div className="slot-controls">
          <button
            className="button outline"
            onClick={() => showWeek(shift(start, -7))}
          >
            Tuần trước
          </button>
          <button className="button outline" onClick={() => showWeek(today())}>
            Tuần hiện tại
          </button>
          <button
            className="button outline"
            onClick={() => showWeek(shift(start, 7))}
          >
            Tuần sau
          </button>
          <label className="field">
            Đi tới ngày
            <input
              type="date"
              value={start}
              onChange={(e) => {
                if (e.target.value) showWeek(e.target.value);
              }}
            />
          </label>
        </div>
        {message && <Notice>{message}</Notice>}
        {resource.loading && <p role="status">Đang tải lịch tuần…</p>}
        {resource.error && (
          <Notice error>
            {resource.error}{" "}
            <button className="button outline" onClick={resource.reload}>
              Thử lại
            </button>
          </Notice>
        )}
        {resource.data && (
          <div className="table-scroll">
            <table className="slot-table">
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Khung giờ</th>
                  <th>Trạng thái</th>
                  <th>Hội viên / Ghi chú</th>
                  {owner && <th>Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 7 }, (_, i) => {
                  const day = shift(start, i);
                  const rows = resource.data!.filter(
                    (slot) => slot.workDate === day,
                  );
                  if (!rows.length)
                    return (
                      <tr key={day}>
                        <th scope="row">{date(day)}</th>
                        <td colSpan={owner ? 4 : 3}>Chưa có ca</td>
                      </tr>
                    );
                  return rows.map((slot) => {
                    const booked = slot.status === "BOOKED";
                    const tooLate =
                      Date.parse(slot.startTime) - Date.now() < 86400000;
                    return (
                      <tr key={slot.id}>
                        <th scope="row">{date(day)}</th>
                        <td>{times(slot)}</td>
                        <td>
                          <span className={`slot-status status-${slot.status}`}>
                            {label[slot.status]}
                          </span>
                        </td>
                        <td>
                          {slot.member
                            ? `${slot.member.displayName} · ${slot.member.memberCode}`
                            : slot.unavailableReason || "—"}
                        </td>
                        {owner && (
                          <td>
                            {booked ? (
                              "Hủy lịch hẹn theo quy định để thay đổi ca đã đặt."
                            ) : tooLate ? (
                              "Chỉ được thay đổi ca trước giờ bắt đầu tối thiểu 24 giờ."
                            ) : (
                              <div className="slot-controls">
                                <button
                                  className="button outline"
                                  onClick={() =>
                                    setChange({
                                      slot,
                                      action:
                                        slot.status === "OPEN"
                                          ? "busy"
                                          : "reopen",
                                    })
                                  }
                                >
                                  {slot.status === "OPEN"
                                    ? actions.busy
                                    : actions.reopen}
                                </button>
                                <button
                                  className="button outline"
                                  onClick={() =>
                                    setChange({ slot, action: "delete" })
                                  }
                                >
                                  Xóa ca
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {change && (
        <SlotConfirmation
          change={change}
          close={() => setChange(null)}
          saved={(msg) => {
            setChange(null);
            setMessage(msg);
            resource.reload();
          }}
        />
      )}
    </>
  );
}

function AdminSchedule() {
  const [params, setParams] = useSearchParams();
  const resource = useResource("directory", () =>
    fetchFromApi<TrainerListResponse>("/api/trainers"),
  );
  const trainers = resource.data?.items || [];
  const selected =
    trainers.find((t) => t.id === params.get("trainer"))?.id || trainers[0]?.id;
  if (resource.loading)
    return <p role="status">Đang tải danh sách huấn luyện viên…</p>;
  if (resource.error)
    return (
      <Notice error>
        {resource.error}{" "}
        <button className="button outline" onClick={resource.reload}>
          Thử lại
        </button>
      </Notice>
    );
  if (!selected) return <p>Chưa có huấn luyện viên.</p>;
  return (
    <>
      <section className="panel">
        <label className="field">
          <span id="schedule-trainer-label">Huấn luyện viên</span>
          <select
            aria-labelledby="schedule-trainer-label"
            value={selected}
            onChange={(e) => {
              const next = new URLSearchParams(params);
              next.set("trainer", e.target.value);
              setParams(next);
            }}
          >
            {trainers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.displayName} · {t.trainerCode}
              </option>
            ))}
          </select>
        </label>
      </section>
      <WeekSchedule key={selected} trainerId={selected} owner={false} />
    </>
  );
}

export function TrainerSchedule({ owner }: { owner: boolean }) {
  return (
    <>
      <PageHeading section="Huấn luyện viên" title="Lịch làm việc PT" />
      {owner ? <WeekSchedule trainerId="me" owner /> : <AdminSchedule />}
    </>
  );
}
