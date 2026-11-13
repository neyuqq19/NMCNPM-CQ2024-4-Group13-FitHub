import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import {
  generateWorkingSlots,
  type RegisterAvailabilityResponse,
  type TrainerListResponse,
  type WorkingSlotDto,
} from "@fithub/contracts";
import { Notice, PageHeading } from "../components";
import {
  TrainerDateField,
  trainerDateLabel,
} from "../components/TrainerDateField";
import { today } from "../data";
import { useResource } from "../hooks/useResource";
import { fetchFromApi } from "../services/api.service";
import "./TrainerSchedule.css";

const clock = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const weekdays = [
  "Thứ hai",
  "Thứ ba",
  "Thứ tư",
  "Thứ năm",
  "Thứ sáu",
  "Thứ bảy",
  "Chủ nhật",
];
const labels = {
  OPEN: "Còn trống",
  BOOKED: "Đã đặt",
  UNAVAILABLE: "Bận",
  STARTED: "Đã bắt đầu · Không có lịch hẹn",
  PAST: "Đã qua · Không có lịch hẹn",
};

function times(slot: WorkingSlotDto) {
  return `${clock.format(new Date(slot.startTime))}–${clock.format(new Date(slot.endTime))}`;
}

function shift(day: string, offset: number) {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

function validDay(value: string | null): value is string {
  return (
    !!value &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    shift(value, 0) === value
  );
}

function monday(day: string) {
  return shift(day, -((new Date(day + "T00:00:00Z").getUTCDay() + 6) % 7));
}

function failure(e: unknown) {
  return e instanceof Error ? e.message : "Không thể cập nhật lịch làm việc.";
}

function slotStatus(slot: WorkingSlotDto, now: number) {
  if (slot.status !== "OPEN" || Date.parse(slot.startTime) > now)
    return slot.status;
  return Date.parse(slot.endTime) <= now ? "PAST" : "STARTED";
}

function lockedReason(slot: WorkingSlotDto, now: number) {
  if (slot.status === "BOOKED")
    return "Ca đã có hội viên đặt. Vào mục Lịch hẹn để hủy theo quy định trước khi thay đổi ca.";
  const remaining = Date.parse(slot.startTime) - now;
  if (remaining <= 0) return "Ca đã bắt đầu nên không thể thay đổi.";
  return remaining < 86400000
    ? "Chỉ được thay đổi ca trước giờ bắt đầu tối thiểu 24 giờ."
    : "";
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
        <TrainerDateField value={day} min={today()} onChange={setDay} />
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

function ScheduleDialog({
  title,
  busy,
  close,
  children,
}: {
  title: string;
  busy: boolean;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="slot-dialog schedule-dialog"
      aria-labelledby="schedule-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <div className="schedule-dialog-head">
        <h2 id="schedule-dialog-title">{title}</h2>
        <button
          type="button"
          className="button outline"
          disabled={busy}
          onClick={close}
          aria-label="Đóng"
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}

function RegisterAvailability({
  initialDay,
  now,
  close,
  onSave,
}: {
  initialDay: string;
  now: number;
  close: () => void;
  onSave: (day: string, message: string) => void;
}) {
  const [day, setDay] = useState(initialDay);
  const [start, setStart] = useState("08:00"),
    [end, setEnd] = useState("12:00");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  let preview: ReturnType<typeof generateWorkingSlots> | undefined;
  let invalid = "";
  const begins = Date.parse(day + "T" + start + ":00+07:00");
  const pastMessage = "Chọn ngày và giờ bắt đầu trong tương lai.";
  if (day && start && end) {
    try {
      preview = generateWorkingSlots(day, start, end);
      if (begins <= now) invalid = pastMessage;
    } catch (e) {
      invalid =
        e instanceof Error && e.message === "RANGE_TOO_SHORT"
          ? "Khung giờ đăng ký phải tối thiểu 60 phút để tạo được ít nhất 1 ca làm việc."
          : "Nhập giờ theo định dạng HH:mm trong khoảng 06:00–22:00.";
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!preview || invalid || busy) return;
    if (begins <= Date.now()) {
      setError(pastMessage);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await fetchFromApi<RegisterAvailabilityResponse>(
        "/api/trainers/me/availability",
        {
          method: "POST",
          body: JSON.stringify({ date: day, startTime: start, endTime: end }),
        },
      );
      onSave(day, `Đã tạo ${result.slots.length} ca làm việc.`);
    } catch (e) {
      setError(failure(e));
      setBusy(false);
    }
  }
  return (
    <ScheduleDialog title="Đăng ký giờ rảnh" close={close} busy={busy}>
      <form onSubmit={save} onChange={() => setError("")}>
        <fieldset className="trainer-fields" disabled={busy}>
          <label className="field">
            Ngày đăng ký
            <TrainerDateField
              required
              min={today()}
              value={day}
              onChange={setDay}
            />
          </label>
          <div className="schedule-times">
            <label className="field">
              Từ giờ
              <input
                required
                placeholder="HH:mm"
                maxLength={5}
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label className="field">
              Đến giờ
              <input
                required
                placeholder="HH:mm"
                maxLength={5}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </div>
          {invalid && <Notice error>{invalid}</Notice>}
          {preview && !invalid && (
            <section aria-label="Xem trước các ca">
              <h3>Xem trước · {preview.slots.length} ca</h3>
              <ul className="slot-preview">
                {preview.slots.map((s) => (
                  <li key={s.startTime}>
                    {s.startTime}–{s.endTime}
                  </li>
                ))}
              </ul>
              <p>
                Nghỉ 15 phút giữa các ca. Bỏ qua {preview.discardedMinutes} phút
                dư cuối khung giờ.
              </p>
            </section>
          )}
          {error && <Notice error>{error}</Notice>}
          <button className="button primary" disabled={!preview || !!invalid}>
            Lưu lịch làm việc
          </button>
        </fieldset>
      </form>
    </ScheduleDialog>
  );
}

const actions = { busy: "Báo bận", reopen: "Mở lại ca", delete: "Xóa ca" };
type Action = keyof typeof actions;

function SlotDetail({
  slot,
  now,
  owner,
  close,
  saved,
}: {
  slot: WorkingSlotDto;
  now: number;
  owner: boolean;
  close: () => void;
  saved: (message: string) => void;
}) {
  const [action, setAction] = useState<Action | null>(null),
    [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const locked = lockedReason(slot, now);
  const status = slotStatus(slot, now);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!owner || busy || !action || (action === "busy" && !reason.trim()))
      return;
    const lock = lockedReason(slot, Date.now());
    if (lock) {
      setError(lock);
      return;
    }
    setBusy(true);
    setError("");
    const path = `/api/trainers/me/slots/${encodeURIComponent(slot.id)}`;
    try {
      if (action === "delete") await fetchFromApi(path, { method: "DELETE" });
      else
        await fetchFromApi(path + "/availability", {
          method: "PATCH",
          body: JSON.stringify(
            action === "busy"
              ? { status: "UNAVAILABLE", reason: reason.trim() }
              : { status: "OPEN" },
          ),
        });
      saved(`Đã ${actions[action].toLocaleLowerCase("vi")}.`);
    } catch (e) {
      setError(failure(e));
      setBusy(false);
    }
  }
  return (
    <ScheduleDialog title="Chi tiết ca làm việc" busy={busy} close={close}>
      <p>
        {trainerDateLabel(slot.workDate)} · <strong>{times(slot)}</strong>
      </p>
      <span className={`schedule-badge tone-${status}`}>{labels[status]}</span>
      {slot.member && (
        <p>
          Hội viên: {slot.member.displayName} · {slot.member.memberCode}
        </p>
      )}
      {slot.unavailableReason && <p>Lý do báo bận: {slot.unavailableReason}</p>}
      {owner &&
        (locked ? (
          <p>{locked}</p>
        ) : action ? (
          <form onSubmit={submit}>
            <h3>{actions[action]}</h3>
            {action === "busy" && (
              <label className="field">
                Lý do báo bận
                <textarea
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            )}
            {action === "delete" && (
              <p>Ca làm việc này sẽ được xóa khỏi lịch.</p>
            )}
            <div className="slot-controls">
              <button
                className="button outline"
                type="button"
                disabled={busy}
                onClick={() => {
                  setAction(null);
                  setError("");
                }}
              >
                Hủy
              </button>
              <button
                className="button primary"
                disabled={busy || (action === "busy" && !reason.trim())}
              >
                Xác nhận
              </button>
            </div>
          </form>
        ) : (
          <div className="slot-controls">
            <button
              className="button primary"
              onClick={() =>
                setAction(slot.status === "OPEN" ? "busy" : "reopen")
              }
            >
              {slot.status === "OPEN" ? actions.busy : actions.reopen}
            </button>
            <button
              className="button outline"
              onClick={() => setAction("delete")}
            >
              {actions.delete}
            </button>
          </div>
        ))}
      {error && <Notice error>{error}</Notice>}
    </ScheduleDialog>
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
  const gymDay = today();
  const routeDay = params.get("day") || params.get("week");
  const selected = validDay(routeDay) ? routeDay : gymDay;
  const start = monday(selected),
    end = shift(start, 6);
  const days = weekdays.map((_, index) => shift(start, index));
  const [detail, setDetail] = useState<WorkingSlotDto | null>(null),
    [register, setRegister] = useState(false);
  const [message, setMessage] = useState(""),
    [now, setNow] = useState(Date.now);
  const selectedButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const button = selectedButton.current;
    if (button && window.matchMedia("(max-width: 800px)").matches) {
      button.parentElement?.scrollTo({
        left: button.offsetLeft - 12,
      });
    }
  }, [selected]);
  const resource = useResource(trainerId + start, () =>
    fetchFromApi<WorkingSlotDto[]>(
      `/api/trainers/${encodeURIComponent(trainerId)}/slots?from=${start}&to=${end}`,
    ),
  );
  function showDay(day: string) {
    if (!validDay(day)) return;
    const next = new URLSearchParams(params);
    next.set("week", monday(day));
    next.set("day", day);
    setParams(next);
    setMessage("");
  }
  function position(value: number, day: string) {
    return Math.min(
      100,
      Math.max(
        0,
        ((value - Date.parse(day + "T06:00:00+07:00")) / (16 * 3600000)) * 100,
      ),
    );
  }
  return (
    <section className="panel schedule-panel" aria-label="Lịch tuần">
      <div className="schedule-head">
        <h2>
          Lịch tuần{" "}
          <small>
            {trainerDateLabel(start)} – {trainerDateLabel(end)}
          </small>
        </h2>
        {owner && (
          <button
            className="button primary"
            onClick={() => {
              setNow(Date.now());
              setRegister(true);
            }}
          >
            + Đăng ký giờ rảnh
          </button>
        )}
      </div>
      <div className="slot-controls schedule-nav">
        <button
          className="button outline"
          onClick={() => showDay(shift(selected, -7))}
        >
          Tuần trước
        </button>
        <button className="button outline" onClick={() => showDay(today())}>
          Tuần hiện tại
        </button>
        <button
          className="button outline"
          onClick={() => showDay(shift(selected, 7))}
        >
          Tuần sau
        </button>
        <label className="field">
          Đi tới ngày
          <TrainerDateField value={selected} onChange={showDay} />
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
      <div className="schedule-days" aria-label="Chọn ngày trong tuần">
        {days.map((day, i) => (
          <button
            key={day}
            type="button"
            aria-pressed={selected === day}
            aria-current={day === gymDay ? "date" : undefined}
            ref={selected === day ? selectedButton : undefined}
            onClick={() => showDay(day)}
          >
            <strong>{weekdays[i]}</strong>
            <span>{trainerDateLabel(day).slice(0, 5)}</span>
            {day === gymDay && <small>Hôm nay</small>}
            {resource.data && (
              <small className="schedule-count">
                {resource.data.filter((slot) => slot.workDate === day).length}{" "}
                ca
              </small>
            )}
          </button>
        ))}
      </div>
      {resource.data && (
        <div className="schedule-grid">
          <div className="schedule-hours" aria-hidden="true">
            {Array.from({ length: 17 }, (_, i) => (
              <span key={i} style={{ top: `${(i / 16) * 100}%` }}>
                {String(i + 6).padStart(2, "0")}:00
              </span>
            ))}
          </div>
          {days.map((day) => {
            const slots = resource.data!.filter((s) => s.workDate === day);
            const elapsed = position(now, day);
            return (
              <div
                key={day}
                className={`schedule-column ${selected === day ? "is-selected" : ""} ${day === gymDay ? "is-today" : ""} ${day < gymDay ? "is-past" : ""}`}
                role="group"
                aria-label={trainerDateLabel(day)}
              >
                <div
                  className="schedule-elapsed"
                  aria-hidden="true"
                  style={{ height: `${elapsed}%` }}
                />
                {!slots.length && (
                  <p className="schedule-empty">Chưa đăng ký</p>
                )}
                {slots.map((slot) => {
                  const status = slotStatus(slot, now);
                  const top = position(Date.parse(slot.startTime), day),
                    bottom = position(Date.parse(slot.endTime), day);
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      className={`schedule-slot tone-${status}`}
                      style={{ top: `${top}%`, height: `${bottom - top}%` }}
                      onClick={() => {
                        setNow(Date.now());
                        setDetail(slot);
                      }}
                    >
                      <strong>{times(slot)}</strong>
                      <span>{labels[status]}</span>
                      {slot.member && (
                        <small>
                          {slot.member.displayName} · {slot.member.memberCode}
                        </small>
                      )}
                      {slot.unavailableReason && (
                        <small>{slot.unavailableReason}</small>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      {register && (
        <RegisterAvailability
          initialDay={selected}
          now={now}
          close={() => setRegister(false)}
          onSave={(day, msg) => {
            setRegister(false);
            showDay(day);
            setMessage(msg);
            if (monday(day) === start) resource.reload();
          }}
        />
      )}
      {detail && (
        <SlotDetail
          slot={detail}
          now={now}
          owner={owner}
          close={() => setDetail(null)}
          saved={(msg) => {
            setDetail(null);
            setMessage(msg);
            resource.reload();
          }}
        />
      )}
    </section>
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
