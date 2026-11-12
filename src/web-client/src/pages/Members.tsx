import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import type {
  CreateMemberRequest,
  MemberDetailDto,
  MemberPage,
  MemberOverviewDto,
  MembershipSummary,
} from "@fithub/contracts";
import { Badge, Empty, FieldError, Notice, PageHeading } from "../components";
import { apiService, ApiError } from "../services/api.service";
import { date, money } from "../data";
import { Eye, Pencil } from "lucide-react";

const statuses: Record<string, string> = {
  ACTIVE: "Đang hoạt động",
  PENDING_VERIFY: "Chờ xác minh",
  LOCKED: "Bị khóa",
  DEACTIVATED: "Ngừng sử dụng",
};
const membershipStatuses: Record<string, string> = {
  ACTIVE: "Còn hạn",
  EXPIRED: "Hết hạn",
  SCHEDULED: "Chưa đến ngày bắt đầu",
  FROZEN: "Đang đóng băng",
  PENDING_PAYMENT: "Chờ thanh toán",
  CANCELLED: "Đã hủy",
};
const show = (value: unknown) =>
  value === null || value === undefined || value === ""
    ? "Chưa cung cấp"
    : String(value);
export function InfoRows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="info-rows">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function MissingMember() {
  return (
    <>
      <PageHeading title="Không tìm thấy hội viên" />
      <Empty
        title="Hồ sơ không tồn tại"
        description="Hãy chọn hội viên trong danh sách."
        action={
          <Link className="button outline" to="/members">
            Về danh sách
          </Link>
        }
      />
    </>
  );
}
function LoadError({ error, retry }: { error: string; retry: () => void }) {
  return (
    <>
      <Notice error>{error}</Notice>
      <button className="button outline" onClick={retry}>
        Thử lại
      </button>
    </>
  );
}
function useMember(id?: string) {
  const [member, setMember] = useState<MemberDetailDto | null>(null);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setMember(null);
    setError("");
    setMissing(false);
    if (!id) {
      setLoading(false);
      return;
    }
    apiService
      .getMember(id)
      .then((m) => {
        if (live) setMember(m);
      })
      .catch((e) => {
        if (live) {
          setMissing(e instanceof ApiError && e.status === 404);
          setError(e.message);
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [id, revision]);
  return {
    member,
    loading,
    error,
    missing,
    retry: () => setRevision((r) => r + 1),
  };
}
function MemberOverview({ refreshKey = "" }: { refreshKey?: string }) {
  const [overview, setOverview] = useState<MemberOverviewDto | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setError("");
    setOverview(null);
    apiService
      .getMemberOverview()
      .then((value) => {
        if (live) setOverview(value);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [refreshKey, attempt]);
  if (error)
    return (
      <div className="member-overview-error">
        <LoadError error={error} retry={() => setAttempt((n) => n + 1)} />
      </div>
    );
  const cards = [
    {
      title: "Tổng hội viên",
      value: overview?.total,
      hint: "Tất cả hồ sơ hội viên trong hệ thống",
    },
    {
      title: "Đang hoạt động",
      value: overview?.active,
      hint: "Tài khoản đã xác minh và đang hoạt động",
    },
    {
      title: "Chờ xác minh",
      value: overview?.pendingVerification,
      hint: "Cần hoàn tất xác minh tài khoản",
    },
    {
      title: "Tạm khóa / Ngừng sử dụng",
      value: overview?.unavailable,
      hint: "Tài khoản hiện không thể đăng nhập",
    },
  ];
  return (
    <section
      className="member-overview"
      aria-label="Tổng quan hội viên"
      aria-busy={!overview}
    >
      {cards.map((card) => (
        <article className="member-overview-card" key={card.title}>
          <div>
            <span>{card.title}</span>
            <strong>
              {card.value === undefined
                ? "—"
                : new Intl.NumberFormat("vi-VN").format(card.value)}
            </strong>
          </div>
          <p>{card.hint}</p>
        </article>
      ))}
    </section>
  );
}
function AccountBadge({ status }: { status: string }) {
  return (
    <Badge
      tone={
        status === "ACTIVE"
          ? "success"
          : status === "PENDING_VERIFY"
            ? "warning"
            : status === "LOCKED"
              ? "danger"
              : "neutral"
      }
    >
      {statuses[status]}
    </Badge>
  );
}
function profileDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
export function MemberList() {
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const urlQuery = params.get("q") || "";
  const [input, setInput] = useState(urlQuery);
  const [composing, setComposing] = useState(false);
  const [result, setResult] = useState<MemberPage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    setInput(urlQuery);
  }, [urlQuery]);
  useEffect(() => {
    if (composing || input.trim() === urlQuery) return;
    const timer = window.setTimeout(() => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (input.trim()) next.set("q", input.trim());
          else next.delete("q");
          next.set("page", "1");
          return next;
        },
        { replace: true },
      );
    }, 350);
    return () => window.clearTimeout(timer);
  }, [input, urlQuery, composing, setParams]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    setResult(null);
    apiService
      .getMembers(query)
      .then((data) => {
        if (live) setResult(data);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [query, revision]);
  function change(values: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(values)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next);
  }
  return (
    <>
      <PageHeading
        title="Hội viên"
        description="Tra cứu và quản lý hồ sơ hội viên."
        action={
          <Link className="button primary" to="/members/new">
            Thêm hội viên
          </Link>
        }
      />
      <MemberOverview />
      <form
        className="search-bar"
        onSubmit={(e) => {
          e.preventDefault();
          change({ q: input.trim(), page: "1" });
        }}
      >
        <label className="field search-field">
          Tìm kiếm
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            placeholder="Mã, họ tên, số điện thoại hoặc email"
          />
        </label>
        <label className="field">
          Trạng thái tài khoản
          <select
            value={params.get("status") || ""}
            onChange={(e) => change({ status: e.target.value, page: "1" })}
          >
            <option value="">Tất cả trạng thái</option>
            {Object.entries(statuses).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button className="button primary">Tìm kiếm</button>
        <button
          className="button outline"
          type="button"
          onClick={() => {
            setInput("");
            setParams({});
          }}
        >
          Xóa tìm kiếm
        </button>
      </form>
      <section className="panel" aria-busy={loading}>
        <h2>Danh sách hội viên</h2>
        {loading && <p role="status">Đang tải hội viên…</p>}
        {error && (
          <LoadError error={error} retry={() => setRevision((r) => r + 1)} />
        )}
        {result && (
          <>
            {result.items.length ? (
              <div className="table-scroll">
                <table className="member-table">
                  <thead>
                    <tr>
                      <th>Mã</th>
                      <th>Họ tên</th>
                      <th>Liên hệ</th>
                      <th>Tài khoản</th>
                      <th>Gói tập</th>
                      <th className="member-action-heading">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.map((m) => (
                      <tr key={m.id}>
                        <td>{m.memberCode}</td>
                        <td>
                          <Link className="table-link" to={`/members/${m.id}`}>
                            {m.displayName}
                          </Link>
                        </td>
                        <td>{m.phone || "Chưa cung cấp"}</td>
                        <td>
                          <AccountBadge status={m.accountStatus} />
                        </td>
                        <td>
                          {m.latestMembership
                            ? `${m.latestMembership.packageName} · ${membershipStatuses[m.latestMembership.status] || m.latestMembership.status}`
                            : "Chưa có gói"}
                        </td>
                        <td className="member-action-cell">
                          <div className="member-row-actions">
                            <Link
                              className="member-action"
                              to={`/members/${m.id}`}
                              aria-label={`Xem chi tiết ${m.displayName}`}
                              title="Xem chi tiết và lịch sử mua gói"
                            >
                              <Eye size={18} aria-hidden="true" />
                            </Link>
                            {m.accountStatus !== "DEACTIVATED" ? (
                              <Link
                                className="member-action"
                                to={`/members/${m.id}/edit`}
                                aria-label={`Chỉnh sửa ${m.displayName}`}
                                title="Chỉnh sửa hồ sơ"
                              >
                                <Pencil size={18} aria-hidden="true" />
                              </Link>
                            ) : (
                              <span
                                className="member-action is-disabled"
                                title="Hồ sơ ngừng sử dụng chỉ được xem"
                                aria-label="Không thể chỉnh sửa hồ sơ đã ngừng sử dụng"
                              >
                                <Pencil size={18} aria-hidden="true" />
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="Không tìm thấy hội viên"
                description="Thử đổi tiêu chí hoặc thêm hội viên mới."
              />
            )}
            <div className="pagination">
              <button
                className="button outline"
                disabled={result.page <= 1}
                onClick={() => change({ page: String(result.page - 1) })}
              >
                Trang trước
              </button>
              <span role="status">
                Trang {result.page} /{" "}
                {Math.max(1, Math.ceil(result.total / result.pageSize))} ·{" "}
                {result.total} hội viên
              </span>
              <button
                className="button outline"
                disabled={result.page * result.pageSize >= result.total}
                onClick={() => change({ page: String(result.page + 1) })}
              >
                Trang sau
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
export function MemberDetail() {
  const { id } = useParams();
  const { member: m, loading, error, missing, retry } = useMember(id);
  const [params] = useSearchParams();
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);
  const [freezeTarget, setFreezeTarget] = useState<MembershipSummary | null>(
    null,
  );
  const [freezeDays, setFreezeDays] = useState(7);
  const [freezeStartsOn, setFreezeStartsOn] = useState(() =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date()),
  );
  const [freezeReason, setFreezeReason] = useState("");
  const [freezeError, setFreezeError] = useState("");
  const [freezeNotice, setFreezeNotice] = useState("");
  const lock = useRef(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (confirm) reasonRef.current?.focus();
  }, [confirm]);
  if (loading) return <p role="status">Đang tải hồ sơ…</p>;
  if (missing) return <MissingMember />;
  if (error || !m) return <LoadError error={error} retry={retry} />;
  async function handleFreeze(e: FormEvent) {
    e.preventDefault();
    if (!freezeTarget || lock.current) return;
    if (!freezeReason.trim()) {
      setFreezeError("Vui lòng nhập lý do bảo lưu gói tập.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setFreezeError("");
    setFreezeNotice("");
    try {
      const res = await apiService.freezeMembership(freezeTarget.id, {
        days: freezeDays,
        startsOn: freezeStartsOn,
        reason: freezeReason.trim(),
      });
      setFreezeTarget(null);
      setFreezeReason("");
      setFreezeNotice(
        res.shiftedScheduledMembership
          ? `Đã bảo lưu gói "${res.membership.packageName}" thêm ${freezeDays} ngày. Gói nối tiếp "${res.shiftedScheduledMembership.packageName}" cũng được dời ngày bắt đầu sang ${date(res.shiftedScheduledMembership.startsOn)}.`
          : `Đã bảo lưu gói "${res.membership.packageName}" thêm ${freezeDays} ngày.`,
      );
      retry();
    } catch (err) {
      setFreezeError(
        err instanceof Error ? err.message : "Không thể bảo lưu gói tập.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function handleUnfreeze(target: MembershipSummary) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setFreezeError("");
    setFreezeNotice("");
    try {
      const res = await apiService.unfreezeMembership(target.id);
      setFreezeNotice(
        `Đã kích hoạt lại gói "${res.membership.packageName}".`,
      );
      retry();
    } catch (err) {
      setFreezeError(
        err instanceof Error ? err.message : "Không thể kích hoạt lại gói tập.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function deactivate() {
    if (!m || lock.current) return;
    if (!reason.trim()) {
      setSaveError("Vui lòng nhập lý do ngừng sử dụng.");
      reasonRef.current?.focus();
      return;
    }
    lock.current = true;
    setBusy(true);
    setSaveError("");
    try {
      await apiService.deactivateMember(m.id, m.version, reason);
      setConfirm(false);
      retry();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Không thể ngừng sử dụng.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        title="Hội viên"
        description="Thông tin liên hệ, trạng thái tài khoản và lịch sử mua gói tập."
        action={
          <Link className="button primary" to="/members/new">
            Thêm hội viên
          </Link>
        }
      />
      <MemberOverview refreshKey={`${m.id}-${m.version}`} />
      <Link className="button outline member-back" to="/members">
        ← Quay lại danh sách
      </Link>
      {params.has("saved") && (
        <Notice>Cập nhật hồ sơ hội viên thành công.</Notice>
      )}
      {params.has("created") && (
        <Notice>
          Hồ sơ đã được lưu. Tài khoản mới cần hoàn tất xác minh trước khi sử
          dụng.
        </Notice>
      )}
      {freezeNotice && <Notice>{freezeNotice}</Notice>}
      {freezeError && !freezeTarget && <Notice error>{freezeError}</Notice>}
      <div className="actions" style={{ marginBottom: 16 }}>
        {m.accountStatus === "ACTIVE" && m.verifiedAt && (
          <Link className="button primary" to={`/members/${m.id}/package`}>
            Đăng ký gói tập
          </Link>
        )}
        {m.accountStatus !== "DEACTIVATED" &&
          m.memberships.map((g) => {
            if (g.status === "ACTIVE" && (g.durationMonths ?? 0) >= 6) {
              return (
                <button
                  key={`freeze-${g.id}`}
                  type="button"
                  className="button outline"
                  disabled={busy}
                  onClick={() => {
                    setFreezeTarget(g);
                    setFreezeDays(7);
                    setFreezeReason("");
                    setFreezeError("");
                  }}
                >
                  Bảo lưu gói ({g.packageName})
                </button>
              );
            }
            if (g.status === "FROZEN") {
              return (
                <button
                  key={`unfreeze-${g.id}`}
                  type="button"
                  className="button outline"
                  disabled={busy}
                  onClick={() => void handleUnfreeze(g)}
                >
                  Kích hoạt lại gói ({g.packageName})
                </button>
              );
            }
            return null;
          })}
        <Link className="button outline" to={`/history?member=${m.id}`}>
          Lịch sử giao dịch
        </Link>
      </div>
      {freezeTarget && (
        <form
          className="panel"
          aria-labelledby="freeze-membership-title"
          onSubmit={handleFreeze}
          style={{ marginBottom: 16 }}
        >
          <h2 id="freeze-membership-title">
            Bảo lưu gói tập · {freezeTarget.packageName}
          </h2>
          <p>
            Chỉ áp dụng cho gói tập từ 6 tháng trở lên đang hoạt động (từ 7 đến
            tối đa 30 ngày cộng dồn). Thời hạn kết thúc và gói chờ kích hoạt kế
            tiếp (nếu có) sẽ tự động được cộng lùi tương ứng.
          </p>
          <div className="form-grid">
            <label className="field">
              Số ngày bảo lưu (7–30 ngày) *
              <input
                type="number"
                min={7}
                max={30}
                required
                disabled={busy}
                value={freezeDays}
                onChange={(e) => setFreezeDays(Number(e.target.value))}
              />
            </label>
            <label className="field">
              Ngày bắt đầu bảo lưu *
              <input
                type="date"
                required
                disabled={busy}
                value={freezeStartsOn}
                onChange={(e) => setFreezeStartsOn(e.target.value)}
              />
            </label>
          </div>
          <label className="field" style={{ marginTop: 12 }}>
            Lý do bảo lưu *
            <textarea
              maxLength={500}
              required
              disabled={busy}
              value={freezeReason}
              placeholder="VD: Hội viên đi công tác xa / điều trị chấn thương..."
              onChange={(e) => setFreezeReason(e.target.value)}
            />
          </label>
          {freezeError && <Notice error>{freezeError}</Notice>}
          <div className="actions">
            <button type="submit" className="button primary" disabled={busy}>
              {busy ? "Đang xử lý…" : "Xác nhận bảo lưu"}
            </button>
            <button
              type="button"
              className="button outline"
              disabled={busy}
              onClick={() => {
                setFreezeTarget(null);
                setFreezeError("");
              }}
            >
              Hủy
            </button>
          </div>
        </form>
      )}
      <section className="panel member-profile" aria-label="Hồ sơ hội viên">
        <header className="member-profile-header">
          <div className="member-profile-identity">
            <span className="member-profile-avatar" aria-hidden="true">
              {m.displayName
                .trim()
                .split(/\s+/)
                .map((part) => part[0])
                .slice(-2)
                .join("")
                .toUpperCase()}
            </span>
            <div>
              <h2>{m.displayName}</h2>
              <p>
                {show(m.phone)} <span>· {m.memberCode}</span>
              </p>
            </div>
          </div>
          <div className="member-profile-header-status">
            <AccountBadge status={m.accountStatus} />
          </div>
        </header>
        <dl className="member-profile-grid">
          <div>
            <dt>Email</dt>
            <dd>{show(m.email)}</dd>
          </div>
          <div>
            <dt>Gói tập hiện tại</dt>
            <dd>
              {m.memberships
                .filter((g) =>
                  ["ACTIVE", "SCHEDULED", "FROZEN"].includes(g.status),
                )
                .map((g) => {
                  const ptInfo =
                    (g.ptSessionsRemaining ?? 0) > 0
                      ? ` · Còn ${g.ptSessionsRemaining} buổi PT`
                      : "";
                  return `${g.packageName} · ${membershipStatuses[g.status]}${ptInfo}`;
                })
                .join(", ") || "Chưa có gói còn hiệu lực"}
            </dd>
          </div>
          <div>
            <dt>Địa chỉ</dt>
            <dd>{show(m.address)}</dd>
          </div>
          <div>
            <dt>Tổng tiền mua gói</dt>
            <dd>
              {money(m.totalSpent)}
              <small>Chỉ tính các khoản đã xác nhận thanh toán</small>
            </dd>
          </div>
          <div>
            <dt>Xác minh liên hệ</dt>
            <dd>{m.verifiedAt ? "Đã xác minh" : "Chưa xác minh"}</dd>
          </div>
          <div>
            <dt>Ngày tạo hồ sơ</dt>
            <dd>{profileDate(m.createdAt)}</dd>
          </div>
          <div>
            <dt>Ngày sinh</dt>
            <dd>{m.dateOfBirth ? date(m.dateOfBirth) : "Chưa cung cấp"}</dd>
          </div>
          <div>
            <dt>Giới tính</dt>
            <dd>
              {m.gender
                ? { MALE: "Nam", FEMALE: "Nữ", OTHER: "Khác" }[m.gender]
                : "Chưa cung cấp"}
            </dd>
          </div>
          <div>
            <dt>Chiều cao / Cân nặng</dt>
            <dd>
              {m.heightCm ? `${m.heightCm} cm` : "Chưa cung cấp"} /{" "}
              {m.weightKg ? `${m.weightKg} kg` : "Chưa cung cấp"}
            </dd>
          </div>
          <div>
            <dt>Tiền sử chấn thương</dt>
            <dd>{show(m.injuryHistory)}</dd>
          </div>
        </dl>
        {m.accountStatus !== "DEACTIVATED" ? (
          <div className="actions">
            <Link className="button outline" to={`/members/${m.id}/edit`}>
              Chỉnh sửa hồ sơ
            </Link>
            <button
              className="button danger"
              onClick={() => {
                setConfirm(true);
                setSaveError("");
              }}
            >
              Ngừng sử dụng
            </button>
          </div>
        ) : (
          <Notice>
            Hồ sơ đã ngừng sử dụng. Chỉ được xem; lịch sử vẫn được bảo toàn.
          </Notice>
        )}
        <div
          className="member-purchase-history"
          aria-labelledby="purchase-history-title"
        >
          <h2 id="purchase-history-title">Lịch sử mua gói tập</h2>
          {m.purchaseHistory.length ? (
            <div className="table-scroll">
              <table
                className="purchase-history-table"
                aria-label="Lịch sử mua gói tập"
              >
                <thead>
                  <tr>
                    <th>Gói tập / Mã đăng ký</th>
                    <th>Ngày đăng ký</th>
                    <th>Số tiền</th>
                    <th>Thanh toán</th>
                    <th>Thời hạn / Trạng thái gói</th>
                  </tr>
                </thead>
                <tbody>
                  {m.purchaseHistory.map((purchase) => (
                    <tr key={purchase.id}>
                      <td>
                        <strong>{purchase.packageName}</strong>
                        <div>{purchase.code}</div>
                      </td>
                      <td>{date(purchase.registeredAt)}</td>
                      <td>
                        {money(purchase.payment?.amount ?? purchase.price)}
                      </td>
                      <td>
                        <div>
                          {purchase.payment?.status === "CONFIRMED"
                            ? "Đã thanh toán"
                            : purchase.payment?.status === "CANCELLED" ||
                                purchase.status === "CANCELLED"
                              ? "Đã hủy"
                              : "Chờ thanh toán"}
                        </div>
                        {purchase.payment && (
                          <div>
                            {purchase.payment.code} ·{" "}
                            {purchase.payment.method === "CASH"
                              ? "Tiền mặt"
                              : purchase.payment.method}
                          </div>
                        )}
                        {purchase.payment?.confirmedAt && (
                          <div>
                            Ngày thu: {date(purchase.payment.confirmedAt)}
                          </div>
                        )}
                      </td>
                      <td>
                        {date(purchase.startsOn)} –{" "}
                        {date(
                          new Date(
                            new Date(purchase.endsBefore).getTime() - 86400000,
                          ).toISOString(),
                        )}
                        <div>
                          {membershipStatuses[purchase.status] ||
                            purchase.status}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="Chưa có lịch sử mua gói tập"
              description="Các lần đăng ký gói và khoản thanh toán của hội viên sẽ hiển thị tại đây."
            />
          )}
        </div>
      </section>
      {confirm && (
        <section
          className="panel"
          aria-labelledby="deactivate-title"
          onKeyDown={(e) => {
            if (e.key === "Escape" && !busy) setConfirm(false);
          }}
        >
          <h2 id="deactivate-title">Xác nhận ngừng sử dụng</h2>
          <p>
            {m.displayName} · {m.memberCode}. Thao tác sẽ thu hồi phiên và chặn
            đăng nhập.
          </p>
          <p>
            Gói còn hiệu lực:{" "}
            {m.memberships
              .filter((g) =>
                ["ACTIVE", "SCHEDULED", "FROZEN"].includes(g.status),
              )
              .map((g) => `${g.packageName} (${membershipStatuses[g.status]})`)
              .join(", ") || "Không có"}
            . Không tự hoàn tiền hoặc thay đổi gói.
          </p>
          <label className="field">
            Lý do ngừng sử dụng *
            <textarea
              ref={reasonRef}
              maxLength={1000}
              value={reason}
              aria-invalid={!!saveError}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {saveError && <Notice error>{saveError}</Notice>}
          <div className="actions">
            <button
              className="button danger"
              disabled={busy}
              onClick={() => void deactivate()}
            >
              {busy ? "Đang lưu…" : "Xác nhận ngừng sử dụng"}
            </button>
            <button
              className="button outline"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Hủy
            </button>
            {saveError && (
              <button
                className="button outline"
                onClick={() => {
                  setConfirm(false);
                  retry();
                }}
              >
                Tải lại hồ sơ
              </button>
            )}
          </div>
        </section>
      )}
    </>
  );
}
type Fields = {
  displayName: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  gender: string;
  address: string;
  heightCm: string;
  weightKg: string;
  injuryHistory: string;
};
const blank: Fields = {
  displayName: "",
  phone: "",
  email: "",
  dateOfBirth: "",
  gender: "",
  address: "",
  heightCm: "",
  weightKg: "",
  injuryHistory: "",
};
export function MemberForm() {
  const { id } = useParams();
  const state = useMember(id);
  if (state.loading) return <p role="status">Đang tải hồ sơ…</p>;
  if (state.missing) return <MissingMember />;
  if (state.error) return <LoadError error={state.error} retry={state.retry} />;
  if (state.member?.accountStatus === "DEACTIVATED")
    return (
      <>
        <Notice>Hồ sơ đã ngừng sử dụng, chỉ được xem.</Notice>
        <Link to={`/members/${id}`}>Xem hồ sơ</Link>
      </>
    );
  return (
    <MemberEditor
      key={`${id || "new"}-${state.member?.version || 0}`}
      member={state.member}
      reload={state.retry}
    />
  );
}
function MemberEditor({
  member,
  reload,
}: {
  member: MemberDetailDto | null;
  reload: () => void;
}) {
  const navigate = useNavigate();
  const [fields, setFields] = useState<Fields>(() =>
    member
      ? (Object.fromEntries(
          Object.keys(blank).map((k) => [
            k,
            String(member[k as keyof MemberDetailDto] ?? ""),
          ]),
        ) as Fields)
      : blank,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [existingId, setExistingId] = useState("");
  const [existingMember, setExistingMember] = useState("");
  const [versionConflict, setVersionConflict] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  async function save(existingUserId?: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setErrors({});
    setError("");
    setExistingId("");
    setExistingMember("");
    const profile = {
      displayName: fields.displayName,
      dateOfBirth: fields.dateOfBirth || null,
      gender: (fields.gender || null) as CreateMemberRequest["gender"],
      address: fields.address || null,
      heightCm: fields.heightCm ? Number(fields.heightCm) : null,
      weightKg: fields.weightKg ? Number(fields.weightKg) : null,
      injuryHistory: fields.injuryHistory || null,
    };
    try {
      const saved = member
        ? await apiService.updateMember(member.id, {
            ...profile,
            version: member.version,
          })
        : await apiService.createMember({
            ...profile,
            email: fields.email || null,
            phone: fields.phone || null,
            ...(existingUserId ? { existingUserId } : {}),
          });
      navigate(`/members/${saved.id}?${member ? "saved" : "created"}=1`);
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors(e.body.fieldErrors || {});
        setExistingId(e.body.existingUserId || "");
        setExistingMember(e.body.memberId || "");
        setVersionConflict(e.body.code === "VERSION_CONFLICT");
      }
      setError(e instanceof Error ? e.message : "Không thể lưu.");
      requestAnimationFrame(() => {
        summaryRef.current?.focus();
      });
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    void save();
  }
  function change(key: keyof Fields, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
    setErrors((old) => ({ ...old, [key]: "", contact: "" }));
    setExistingId("");
    setExistingMember("");
  }
  function field(key: keyof Fields, label: string, type = "text") {
    const contact = key === "phone" || key === "email";
    const message = errors[key] || (contact ? errors.contact : "");
    return (
      <div className="field" key={key}>
        <label htmlFor={`member-${key}`}>{label}</label>
        <input
          id={`member-${key}`}
          type={type}
          value={fields[key]}
          readOnly={!!member && contact}
          aria-invalid={!!message}
          aria-describedby={message ? `${key}-error` : undefined}
          onChange={(e) => change(key, e.target.value)}
        />
        <FieldError id={`${key}-error`} message={message} />
      </div>
    );
  }
  return (
    <>
      <PageHeading
        title={member ? "Chỉnh sửa hồ sơ" : "Thêm hội viên"}
        description={
          member?.memberCode ||
          "Tạo hồ sơ tại quầy; chưa cấp quyền sử dụng gói tập."
        }
        back={member ? `/members/${member.id}` : "/members"}
      />
      <section className="panel">
        <h2>Thông tin hội viên</h2>
        <form ref={formRef} onSubmit={submit} noValidate>
          {error && (
            <div ref={summaryRef} tabIndex={-1} aria-labelledby="form-errors">
              <h3 id="form-errors">Không thể lưu hồ sơ</h3>
              <Notice error>{error}</Notice>
              <ul>
                {Object.entries(errors).map(([key, message]) => {
                  const target = key === "contact" ? "phone" : key;
                  return (
                    <li key={key}>
                      {target in blank ? (
                        <a
                          href={`#member-${target}`}
                          onClick={(e) => {
                            e.preventDefault();
                            document
                              .getElementById(`member-${target}`)
                              ?.focus();
                          }}
                        >
                          {message}
                        </a>
                      ) : (
                        message
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <div className="form-grid">
            {field("displayName", "Họ và tên *")}
            {field("phone", "Số điện thoại", "tel")}
            {field("email", "Email", "email")}
            {field("dateOfBirth", "Ngày sinh", "date")}
            <label className="field">
              Giới tính
              <select
                value={fields.gender}
                onChange={(e) => change("gender", e.target.value)}
              >
                <option value="">Chưa cung cấp</option>
                <option value="MALE">Nam</option>
                <option value="FEMALE">Nữ</option>
                <option value="OTHER">Khác</option>
              </select>
            </label>
            {field("address", "Địa chỉ")}
            {field("heightCm", "Chiều cao (cm)", "number")}
            {field("weightKg", "Cân nặng (kg)", "number")}
            <div className="field">
              <label htmlFor="member-injuryHistory">Tiền sử chấn thương</label>
              <textarea
                id="member-injuryHistory"
                maxLength={2000}
                value={fields.injuryHistory}
                onChange={(e) => change("injuryHistory", e.target.value)}
                aria-invalid={!!errors.injuryHistory}
                aria-describedby={
                  errors.injuryHistory ? "injuryHistory-error" : undefined
                }
              />
              <FieldError
                id="injuryHistory-error"
                message={errors.injuryHistory}
              />
            </div>
          </div>
          <p>
            {member
              ? "Liên hệ đăng nhập chỉ được thay đổi qua quy trình xác minh riêng. Sửa hồ sơ không thay đổi trạng thái tài khoản hoặc gói tập."
              : "Cần ít nhất một số điện thoại hoặc email. Tài khoản mới ở trạng thái chờ xác minh."}
          </p>

          {existingMember && (
            <Link className="button primary" to={`/members/${existingMember}`}>
              Mở hồ sơ đã có
            </Link>
          )}
          {existingId && (
            <div className="actions">
              <button
                type="button"
                className="button primary"
                disabled={busy}
                onClick={() => void save(existingId)}
              >
                Xác nhận bổ sung hồ sơ vào tài khoản hiện có
              </button>
              <button
                type="button"
                className="button outline"
                onClick={() => {
                  setExistingId("");
                  setError("");
                }}
              >
                Hủy bổ sung
              </button>
            </div>
          )}
          {versionConflict && (
            <button className="button outline" type="button" onClick={reload}>
              Tải lại bản mới (bỏ thay đổi chưa lưu)
            </button>
          )}
          <div className="actions">
            <button
              className="button primary"
              type="submit"
              disabled={busy || versionConflict}
            >
              {busy ? "Đang lưu…" : member ? "Lưu thay đổi" : "Tạo hồ sơ"}
            </button>
            <Link
              className="button outline"
              to={member ? `/members/${member.id}` : "/members"}
            >
              Hủy
            </Link>
          </div>
        </form>
      </section>
    </>
  );
}
