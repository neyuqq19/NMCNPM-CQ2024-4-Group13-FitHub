import { useRef, useState, type FormEvent } from "react";
import {
  Link,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import type {
  ConfirmPaymentRequest,
  CounterPaymentMethod,
  InvoiceDto,
  PaymentDetailDto,
  PaymentPageDto,
  PurchaseOptionsDto,
  ReconcilePaymentRequest,
  RegisterMembershipRequest,
} from "@fithub/contracts";
import { Empty, Notice, PageHeading } from "../components";
import { fetchFromApi } from "../services/api.service";
import { useResource } from "../hooks/useResource";
import { date, money, packageEnd, today } from "../data";
import { InfoRows } from "./Members";
const statuses: Record<string, string> = {
  PENDING: "Chờ thanh toán",
  CONFIRMED: "Đã thu",
  CANCELLED: "Đã hủy",
  FAILED: "Thanh toán thất bại",
};
const methods: Record<string, string> = {
  CASH: "Tiền mặt",
  BANK_TRANSFER: "Chuyển khoản",
  VNPAY: "VNPay",
};
const statusLabel = (p: PaymentDetailDto) =>
  p.status === "CONFIRMED"
    ? `Đã thu · ${methods[p.method] ?? p.method}${p.reconciliationStatus === "MISMATCHED" ? " · Cần đối soát" : ""}`
    : (statuses[p.status] ?? p.status);
const endDate = (value: string) =>
  date(
    new Date(Date.parse(`${value}T00:00:00Z`) - 86400000)
      .toISOString()
      .slice(0, 10),
  );
const getPayment = (id: string) =>
  fetchFromApi<PaymentDetailDto>(`/api/payments/${id}`);
function LoadState({
  loading,
  error,
  reload,
}: {
  loading: boolean;
  error: string;
  reload: () => void;
}) {
  return loading ? (
    <p role="status">Đang tải dữ liệu…</p>
  ) : (
    <>
      <Notice error>{error || "Không tìm thấy dữ liệu."}</Notice>
      <button className="button outline" onClick={reload}>
        Thử lại
      </button>
    </>
  );
}
export function PackagePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useResource(`purchase:${id}`, () =>
    fetchFromApi<PurchaseOptionsDto>(`/api/members/${id}/purchase-options`),
  );
  const [selected, setSelected] = useState(""),
    [start, setStart] = useState(""),
    [saveError, setSaveError] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false),
    attempt = useRef<{ signature: string; id: string } | null>(null);
  const pack =
    data?.packages.find((p) => p.id === selected) || data?.packages[0];
  const startsOn = start || data?.suggestedStartsOn || today();
  const eligible =
    data?.member.accountStatus === "ACTIVE" && data.member.verified;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!pack || !id || lock.current) return;
    lock.current = true;
    setBusy(true);
    setSaveError("");
    const signature = JSON.stringify([id, pack.id, startsOn, pack.price]);
    if (attempt.current?.signature !== signature)
      attempt.current = { signature, id: crypto.randomUUID() };
    const body: RegisterMembershipRequest = {
      requestId: attempt.current.id,
      packageId: pack.id,
      startsOn,
      expectedPrice: pack.price,
    };
    try {
      const p = await fetchFromApi<PaymentDetailDto>(
        `/api/members/${id}/memberships`,
        { method: "POST", body: JSON.stringify(body) },
      );
      await getPayment(p.id);
      navigate(`/payments/${p.id}`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Không thể tạo đăng ký.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading title="Đăng ký gói tập" back={`/members/${id}`} />
      {loading || error || !data ? (
        <LoadState loading={loading} error={error} reload={reload} />
      ) : (
        <form className="panel" onSubmit={submit}>
          <h2>
            {data.member.displayName} · {data.member.memberCode}
          </h2>
          {!eligible && (
            <Notice error>
              Hội viên phải xác minh và có tài khoản đang hoạt động trước khi
              đăng ký gói.
            </Notice>
          )}
          {data.pendingPayments.length > 0 && (
            <Notice>
              Có khoản đang chờ:{" "}
              {data.pendingPayments.map((p) => (
                <Link key={p.id} to={`/payments/${p.id}`}>
                  {p.code}{" "}
                </Link>
              ))}
              . Có thể tiếp tục thu tiền hoặc hủy đăng ký đang chờ.
            </Notice>
          )}
          {!data.packages.length ? (
            <Empty
              title="Chưa có gói đang cung cấp"
              description="Liên hệ quản trị viên để cập nhật danh mục."
            />
          ) : (
            <>
              <div className="form-grid">
                <label className="field">
                  Gói tập
                  <select
                    aria-label="Gói tập"
                    value={pack?.id || ""}
                    disabled={busy}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    {data.packages.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {money(p.price)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Ngày bắt đầu
                  <input
                    type="date"
                    value={startsOn}
                    min={today()}
                    required
                    disabled={busy}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
              </div>
              {pack && (
                <InfoRows
                  rows={[
                    ["Giá gói", money(pack.price)],
                    [
                      "Thời hạn",
                      `${date(startsOn)} – ${date(packageEnd(startsOn, pack.durationMonths))}`,
                    ],
                    [
                      "Khung giờ tập",
                      pack.accessWindow === "OFF_PEAK"
                        ? "Thấp điểm Off-peak (09:00–16:00)"
                        : "Toàn khung giờ (05:30–22:00)",
                    ],
                    [
                      "Buổi PT kèm theo",
                      (pack.ptSessionsIncluded ?? 0) > 0
                        ? `Kèm ${pack.ptSessionsIncluded} buổi PT`
                        : "Không kèm PT",
                    ],
                    ["Quyền vào gym", pack.grantsGymAccess ? "Có" : "Không"],
                  ]}
                />
              )}
              <p>
                Ngày gợi ý nối tiếp kỳ đã mua. Gói chỉ có quyền sử dụng sau khi
                khoản thu được xác nhận.
              </p>
              {!!saveError && <Notice error>{saveError}</Notice>}
              <div className="actions">
                <button
                  className="button primary"
                  disabled={!eligible || busy || !pack}
                >
                  {busy ? "Đang tạo đăng ký…" : "Tiếp tục thu tiền"}
                </button>
                <button
                  type="button"
                  className="button outline"
                  disabled={busy}
                  onClick={reload}
                >
                  Tải lại danh mục
                </button>
                <Link className="button outline" to={`/members/${id}`}>
                  Quay lại hồ sơ
                </Link>
              </div>
            </>
          )}
        </form>
      )}
    </>
  );
}
function PaymentInfo({ p }: { p: PaymentDetailDto }) {
  return (
    <>
      <InfoRows
        rows={[
          ["Mã giao dịch", p.code],
          ["Hội viên", `${p.member.displayName} · ${p.member.memberCode}`],
          ["Gói tập", p.membership.packageName],
          [
            "Thời hạn",
            `${date(p.membership.startsOn)} – ${endDate(p.membership.endsBefore)}`,
          ],
          ["Tổng tiền", money(p.amount)],
          ["Trạng thái", statusLabel(p)],
          [
            "Hình thức thanh toán",
            p.status === "CONFIRMED" || p.method !== "CASH"
              ? (methods[p.method] ?? p.method)
              : "Chưa xác định",
          ],
          ...(p.transferReference
            ? ([["Tham chiếu chuyển khoản", p.transferReference]] as [
                string,
                string,
              ][])
            : []),
          [
            "Ngày xác nhận",
            p.confirmedAt ? date(p.confirmedAt) : "Chưa xác nhận",
          ],
          [
            "Người xác nhận",
            p.confirmedBy ||
              (p.method === "VNPAY" && p.confirmedAt
                ? "Cổng VNPay (tự động)"
                : "Chưa xác nhận"),
          ],
        ]}
      />
      {p.isTest && (
        <Notice>
          Dữ liệu TEST QR · giao dịch thử nghiệm, không tính vào doanh thu.
        </Notice>
      )}
    </>
  );
}
function Receipt({ invoice }: { invoice: InvoiceDto }) {
  const r = invoice.receipt;
  if (!r) return null;
  const rows: [string, string][] = [
    ["Số hóa đơn", invoice.code ?? "—"],
    ["Ngày phát hành", invoice.issuedAt ? date(invoice.issuedAt) : "—"],
    ["Khách hàng", `${r.buyerName} · ${r.memberCode}`],
    ["Gói tập", r.packageName],
    ["Thời hạn", r.period],
    ["Số tiền", money(r.amount)],
    ["Hình thức thanh toán", r.method],
    ["Ngày thanh toán", date(r.paidAt)],
    ["Mã giao dịch", r.paymentCode],
    ...(r.cashier ? ([["Thu ngân", r.cashier]] as [string, string][]) : []),
  ];
  return (
    <div className="receipt-print panel" aria-label="Biên lai thanh toán">
      <style>{`@media print { body * { visibility: hidden } .receipt-print, .receipt-print * { visibility: visible } .receipt-print { position: absolute; inset: 0; border: 0 } .receipt-print .no-print { display: none } }`}</style>
      <h2>Biên lai thanh toán gói tập</h2>
      <InfoRows rows={rows} />
      <p>
        <small>
          Hóa đơn điện tử mô phỏng (SIMULATED), chưa kết nối nhà cung cấp hóa
          đơn.
        </small>
      </p>
      <button
        type="button"
        className="button primary no-print"
        onClick={() => window.print()}
      >
        In biên lai
      </button>
    </div>
  );
}
function InvoiceSection({
  p,
  onChanged,
}: {
  p: PaymentDetailDto;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [show, setShow] = useState(false);
  async function retry() {
    setBusy(true);
    setError("");
    try {
      await fetchFromApi<PaymentDetailDto>(
        `/api/payments/${p.id}/retry-invoice`,
        { method: "POST", body: "{}" },
      );
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể phát hành hóa đơn.");
    } finally {
      setBusy(false);
    }
  }
  const inv = p.invoice;
  return (
    <div className="panel" aria-label="Hóa đơn">
      <h2>Hóa đơn</h2>
      {inv?.status === "ISSUED" ? (
        <>
          <InfoRows
            rows={[
              ["Số hóa đơn", inv.code ?? "—"],
              ["Ngày phát hành", inv.issuedAt ? date(inv.issuedAt) : "—"],
            ]}
          />
          <div className="actions">
            <button
              type="button"
              className="button outline"
              onClick={() => setShow((v) => !v)}
            >
              {show ? "Ẩn biên lai" : "Xem / In biên lai"}
            </button>
          </div>
          {show && <Receipt invoice={inv} />}
        </>
      ) : (
        <>
          <Notice error={inv?.status === "FAILED"}>
            {inv?.status === "FAILED"
              ? `Khoản thu đã ghi nhận nhưng chưa phát hành được hóa đơn${inv.errorMessage ? `: ${inv.errorMessage}` : "."}`
              : "Hóa đơn đang được phát hành. Làm mới trang hoặc bấm phát hành lại nếu chưa thấy."}
          </Notice>
          {error && <Notice error>{error}</Notice>}
          <div className="actions">
            <button
              type="button"
              className="button primary"
              disabled={busy}
              onClick={() => void retry()}
            >
              {busy ? "Đang phát hành…" : "Phát hành lại hóa đơn"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
function ReconcileSection({
  p,
  onChanged,
}: {
  p: PaymentDetailDto;
  onChanged: () => void;
}) {
  const needsGrant = p.benefitStatus === "NEEDS_REVIEW";
  const [action, setAction] =
    useState<ReconcilePaymentRequest["action"]>(needsGrant ? "GRANT" : "DISMISS"),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body: ReconcilePaymentRequest = {
        action,
        ...(note.trim() ? { note: note.trim() } : {}),
      };
      await fetchFromApi<PaymentDetailDto>(`/api/payments/${p.id}/reconcile`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể đối soát.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel" onSubmit={submit} aria-label="Đối soát giao dịch">
      <h2>Cần đối soát</h2>
      <Notice error>
        {needsGrant
          ? "Đã nhận tiền qua VNPay nhưng hệ thống chưa cấp được quyền lợi gói tập. Kiểm tra rồi cấp lại gói hoặc ghi nhận đã xử lý ngoài hệ thống (ví dụ hoàn tiền)."
          : "Hệ thống nhận thêm một khoản thanh toán cho giao dịch này (đã thu bằng kênh khác). Kiểm tra và hoàn tiền cho hội viên nếu cần, rồi ghi nhận đã xử lý."}
      </Notice>
      <div className="form-grid">
        <label className="field">
          Hướng xử lý
          <select
            aria-label="Hướng xử lý"
            value={action}
            disabled={busy}
            onChange={(e) =>
              setAction(e.target.value as ReconcilePaymentRequest["action"])
            }
          >
            {needsGrant && <option value="GRANT">Cấp lại quyền lợi gói</option>}
            <option value="DISMISS">Đã xử lý ngoài hệ thống</option>
          </select>
        </label>
        <label className="field">
          Ghi chú {action === "DISMISS" ? "(bắt buộc)" : "(tùy chọn)"}
          <input
            aria-label="Ghi chú đối soát"
            maxLength={500}
            value={note}
            required={action === "DISMISS"}
            disabled={busy}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>
      {error && <Notice error>{error}</Notice>}
      <div className="actions">
        <button className="button primary" disabled={busy}>
          {busy ? "Đang lưu…" : "Xác nhận đối soát"}
        </button>
      </div>
    </form>
  );
}
export function PaymentPage() {
  const { paymentId } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useResource(
    `payment:${paymentId}`,
    () => getPayment(paymentId!),
  );
  const [saveError, setSaveError] = useState(""),
    [busy, setBusy] = useState(false),
    [cancel, setCancel] = useState(false),
    [method, setMethod] = useState<CounterPaymentMethod>("CASH"),
    [reference, setReference] = useState("");
  const lock = useRef(false);
  const key = useRef<string | null>(null);
  async function decide(isCancel = false) {
    if (!data || lock.current) return;
    lock.current = true;
    setBusy(true);
    setSaveError("");
    key.current ||= crypto.randomUUID();
    try {
      const body: ConfirmPaymentRequest = {
        idempotencyKey: key.current,
        amount: data.amount,
        method,
        ...(method === "BANK_TRANSFER" && reference.trim()
          ? { reference: reference.trim() }
          : {}),
      };
      await fetchFromApi(
        `/api/payments/${data.id}/${isCancel ? "cancel" : "confirm"}`,
        { method: "POST", body: JSON.stringify(isCancel ? {} : body) },
      );
      const fresh = await getPayment(data.id);
      if (fresh.status === "CONFIRMED")
        navigate(`/payments/${data.id}/success`, { replace: true });
      else {
        setCancel(false);
        reload();
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Không thể lưu giao dịch.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (data?.status === "CONFIRMED")
    return <Navigate to={`/payments/${data.id}/success`} replace />;
  return (
    <>
      <PageHeading title="Xác nhận thu tiền" section="Giao dịch" />
      {loading || error || !data ? (
        <LoadState loading={loading} error={error} reload={reload} />
      ) : (
        <section className="panel">
          <PaymentInfo p={data} />
          {data.status === "PENDING" || data.status === "FAILED" ? (
            <>
              {data.status === "FAILED" && (
                <Notice error>
                  Thanh toán VNPay không thành công. Hội viên có thể thử lại
                  trên ứng dụng hoặc bạn có thể thu trực tiếp tại quầy.
                </Notice>
              )}
              {data.onlineExpiresAt && (
                <Notice>
                  Hội viên đang thanh toán qua VNPay (hết hạn lúc{" "}
                  {new Date(data.onlineExpiresAt).toLocaleTimeString("vi-VN")}
                  ). Chờ kết quả hoặc làm mới sau khi hết hạn rồi mới thu tại
                  quầy để tránh thu hai lần.
                </Notice>
              )}
              <div className="form-grid">
                <label className="field">
                  Hình thức thu tại quầy
                  <select
                    aria-label="Hình thức thu tại quầy"
                    value={method}
                    disabled={busy}
                    onChange={(e) =>
                      setMethod(e.target.value as CounterPaymentMethod)
                    }
                  >
                    <option value="CASH">Tiền mặt</option>
                    <option value="BANK_TRANSFER">Chuyển khoản</option>
                  </select>
                </label>
                {method === "BANK_TRANSFER" && (
                  <label className="field">
                    Tham chiếu chuyển khoản (nếu có)
                    <input
                      aria-label="Tham chiếu chuyển khoản"
                      maxLength={100}
                      value={reference}
                      disabled={busy}
                      onChange={(e) => setReference(e.target.value)}
                    />
                  </label>
                )}
              </div>
              <p>
                {method === "CASH"
                  ? "Chỉ xác nhận sau khi đã nhận đủ tiền mặt từ hội viên."
                  : "Chỉ xác nhận sau khi tiền đã vào tài khoản của phòng tập."}
              </p>
              {saveError && <Notice error>{saveError}</Notice>}
              <div className="actions">
                <button
                  className="button primary"
                  disabled={
                    busy ||
                    data.member.accountStatus !== "ACTIVE" ||
                    !!data.onlineExpiresAt
                  }
                  onClick={() => void decide()}
                >
                  {busy
                    ? "Đang lưu…"
                    : `Đã nhận ${money(data.amount)} · Xác nhận`}
                </button>
                <button
                  className="button outline"
                  disabled={busy}
                  onClick={() => setCancel(true)}
                >
                  Hủy đăng ký
                </button>
              </div>
              {cancel && (
                <div
                  role="group"
                  aria-label="Xác nhận hủy đăng ký"
                  className="panel"
                >
                  <h2>Hủy đăng ký đang chờ?</h2>
                  <p>
                    Giao dịch sẽ được giữ trong lịch sử với trạng thái đã hủy.
                  </p>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => setCancel(false)}
                  >
                    Không hủy
                  </button>{" "}
                  <button
                    className="button danger"
                    disabled={busy}
                    onClick={() => void decide(true)}
                  >
                    Xác nhận hủy
                  </button>
                </div>
              )}
            </>
          ) : (
            <Notice>Đăng ký đã hủy, chưa phát sinh quyền vào tập.</Notice>
          )}
          <div className="actions">
            <Link className="button outline" to={`/members/${data.member.id}`}>
              Xem hồ sơ và gói tập
            </Link>
            <Link className="button outline" to="/history">
              Về giao dịch
            </Link>
          </div>
        </section>
      )}
    </>
  );
}
export function SuccessPage() {
  const { paymentId } = useParams();
  const { data, error, loading, reload } = useResource(
    `success:${paymentId}`,
    () => getPayment(paymentId!),
  );
  if (data && data.status !== "CONFIRMED")
    return <Navigate to={`/payments/${data.id}`} replace />;
  return (
    <>
      <PageHeading title="Thu tiền thành công" section="Giao dịch" />
      {loading || error || !data ? (
        <LoadState loading={loading} error={error} reload={reload} />
      ) : (
        <section className="panel">
          <h2>
            {data.benefitStatus === "NEEDS_REVIEW"
              ? "Đã nhận tiền · gói tập chờ đối soát"
              : data.membership.status === "SCHEDULED"
                ? "Gói tập đã lên lịch"
                : "Khoản thu đã được ghi nhận"}
          </h2>
          <PaymentInfo p={data} />
          {data.reconciliationStatus === "MISMATCHED" ? (
            <ReconcileSection p={data} onChanged={reload} />
          ) : (
            <p>
              Khoản thu và gói tập đã lưu trên hệ thống. Không cần thanh toán
              lại.
            </p>
          )}
          <InvoiceSection p={data} onChanged={reload} />
          <div className="actions">
            <Link className="button outline" to={`/members/${data.member.id}`}>
              Xem hồ sơ và gói tập
            </Link>
            <Link
              className="button primary"
              to={`/history?member=${data.member.id}`}
            >
              Xem giao dịch
            </Link>
          </div>
        </section>
      )}
    </>
  );
}
export function HistoryPage() {
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const { data, error, loading, reload } = useResource(`history:${query}`, () =>
    fetchFromApi<PaymentPageDto>(`/api/payments?${query}`),
  );
  const [search, setSearch] = useState(params.get("q") || "");
  const change = (values: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    setParams(next);
  };
  return (
    <>
      <PageHeading
        title="Giao dịch"
        section="Giao dịch"
        description="Khoản chờ, khoản đã thu và lịch sử hủy được lưu trên hệ thống."
        action={
          <button
            className="button outline"
            disabled={loading}
            onClick={reload}
          >
            Làm mới
          </button>
        }
      />
      <form
        className="search-bar"
        onSubmit={(e) => {
          e.preventDefault();
          change({ q: search, page: "1" });
        }}
      >
        <input
          className="search-field"
          aria-label="Tìm giao dịch"
          placeholder="Mã giao dịch, mã hoặc tên hội viên"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Trạng thái giao dịch"
          value={params.get("status") || ""}
          onChange={(e) => change({ status: e.target.value, page: "1" })}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="PENDING">Chờ thanh toán</option>
          <option value="CONFIRMED">Đã thu</option>
          <option value="CANCELLED">Đã hủy</option>
          <option value="FAILED">Thanh toán thất bại</option>
          <option value="NEEDS_REVIEW">Cần đối soát</option>
        </select>
        <button className="button primary">Tìm kiếm</button>
        {params.get("member") && (
          <Link className="button outline" to="/history">
            Tất cả giao dịch
          </Link>
        )}
      </form>
      <section className="panel">
        <h2>Lịch sử thanh toán</h2>
        {loading || error || !data ? (
          <LoadState loading={loading} error={error} reload={reload} />
        ) : data.items.length ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Mã</th>
                    <th>Hội viên</th>
                    <th>Gói tập</th>
                    <th>Ngày tạo</th>
                    <th>Số tiền</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link
                          className="table-link"
                          to={`/payments/${p.id}${p.status === "CONFIRMED" ? "/success" : ""}`}
                        >
                          {p.code}
                        </Link>
                        {p.isTest && <small> · TEST</small>}
                      </td>
                      <td>
                        <Link
                          className="table-link"
                          to={`/members/${p.member.id}`}
                        >
                          {p.member.displayName} · {p.member.memberCode}
                        </Link>
                      </td>
                      <td>{p.membership.packageName}</td>
                      <td>{date(p.createdAt)}</td>
                      <td>{money(p.amount)}</td>
                      <td>{statusLabel(p)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <button
                className="button outline"
                disabled={data.page === 1}
                onClick={() => change({ page: String(data.page - 1) })}
              >
                Trang trước
              </button>
              <span>
                Trang {data.page} /{" "}
                {Math.max(1, Math.ceil(data.total / data.pageSize))} ·{" "}
                {data.total} giao dịch
              </span>
              <button
                className="button outline"
                disabled={data.page * data.pageSize >= data.total}
                onClick={() => change({ page: String(data.page + 1) })}
              >
                Trang sau
              </button>
            </div>
          </>
        ) : (
          <Empty
            title="Chưa có giao dịch"
            description="Không có khoản thu phù hợp bộ lọc."
            action={
              <Link className="button outline" to="/members">
                Chọn hội viên
              </Link>
            }
          />
        )}
      </section>
    </>
  );
}
