import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type {
  CreateEquipmentRequest,
  CreateIncidentRequest,
  EquipmentCategory,
  EquipmentDetailDto,
  EquipmentDto,
  EquipmentOverviewDto,
  EquipmentStatus,
  IncidentSeverity,
  ResolveMaintenanceRequest,
  RetireEquipmentRequest,
  UpdateEquipmentRequest,
} from "@fithub/contracts";
import { BrowserQRCodeSvgWriter } from "@zxing/browser";
import {
  Plus,
  QrCode,
  Printer,
  Wrench,
  CheckCircle2,
  ArchiveX,
  Edit3,
  Eye,
  AlertTriangle,
  Search,
  RotateCcw,
  Calendar,
} from "lucide-react";
import { Badge, Empty, FieldError, Notice, PageHeading } from "../components";
import { ApiError, apiService } from "../services/api.service";

const DEFAULT_ZONES = [
  "Tầng 1 - Khu Cardio",
  "Tầng 1 - Khu Functional",
  "Tầng 2 - Khu Strength",
  "Tầng 2 - Khu Free Weight",
];

function normalizeZoneKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isoToDdMmYyyy(iso?: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function ddMmYyyyToIso(display: string): string | null {
  const trimmed = display.trim();
  if (!trimmed) return "";
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(trimmed);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yyyy < 1990 || yyyy > 2100) {
    return null;
  }
  const iso = `${String(yyyy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  const dt = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso) {
    return null;
  }
  return iso;
}

function DateInputDdMmYyyy({
  id,
  valueIso,
  onChangeIso,
  ariaInvalid,
}: {
  id: string;
  valueIso: string;
  onChangeIso: (nextIso: string) => void;
  ariaInvalid?: boolean;
}) {
  const [text, setText] = useState(() => isoToDdMmYyyy(valueIso));
  const nativePickerRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setText(isoToDdMmYyyy(valueIso));
  }, [valueIso]);

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        placeholder="dd/MM/yyyy"
        value={text}
        aria-invalid={ariaInvalid}
        style={{ paddingRight: "2.4rem", width: "100%" }}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          if (!raw.trim()) {
            onChangeIso("");
            return;
          }
          const parsed = ddMmYyyyToIso(raw);
          if (parsed) {
            onChangeIso(parsed);
          }
        }}
        onBlur={() => {
          if (!text.trim()) {
            onChangeIso("");
            return;
          }
          const parsed = ddMmYyyyToIso(text);
          if (parsed) {
            setText(isoToDdMmYyyy(parsed));
            onChangeIso(parsed);
          }
        }}
      />
      <button
        type="button"
        aria-label="Chọn ngày từ lịch"
        title="Chọn ngày"
        onClick={() => {
          const el = nativePickerRef.current;
          if (!el) return;
          if ("showPicker" in el && typeof el.showPicker === "function") {
            el.showPicker();
          } else {
            el.focus();
          }
        }}
        style={{
          position: "absolute",
          right: "0.45rem",
          background: "transparent",
          border: "none",
          color: "#475569",
          cursor: "pointer",
          padding: "0.25rem",
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        <Calendar size={16} aria-hidden="true" />
      </button>
      <input
        ref={nativePickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={valueIso || ""}
        onChange={(e) => {
          onChangeIso(e.target.value);
          setText(isoToDdMmYyyy(e.target.value));
        }}
        style={{
          position: "absolute",
          opacity: 0,
          pointerEvents: "none",
          width: 0,
          height: 0,
        }}
      />
    </div>
  );
}

function QrCodeGraphic({
  payload,
  size = 148,
}: {
  payload: string;
  size?: number;
}) {
  const svgMarkup = useMemo(() => {
    try {
      const writer = new BrowserQRCodeSvgWriter();
      const svgElement = writer.write(payload, size, size);
      svgElement.setAttribute("viewBox", `0 0 ${size} ${size}`);
      svgElement.style.display = "block";
      return svgElement.outerHTML;
    } catch {
      return "";
    }
  }, [payload, size]);

  if (!svgMarkup) {
    return <QrCode size={56} aria-hidden="true" />;
  }

  return (
    <div
      className="qr-svg-container"
      aria-label={`Mã QR cho ${payload}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#ffffff",
        padding: "0.5rem",
        borderRadius: "10px",
        border: "1px solid #cbd5e1",
      }}
      dangerouslySetInnerHTML={{ __html: svgMarkup }}
    />
  );
}

function ZoneSelectorField({
  id,
  value,
  availableZones,
  onChange,
  onAddZone,
  errorMessage,
}: {
  id: string;
  value: string;
  availableZones: string[];
  onChange: (zone: string) => void;
  onAddZone: (newZone: string) => void;
  errorMessage?: string;
}) {
  const [addingNew, setAddingNew] = useState(false);
  const [newZoneText, setNewZoneText] = useState("");
  const [localError, setLocalError] = useState("");

  function handleConfirmAddZone() {
    const trimmed = newZoneText.trim();
    if (!trimmed) {
      setLocalError("Vui lòng nhập tên khu vực mới.");
      return;
    }
    const normNew = normalizeZoneKey(trimmed);
    const duplicate = availableZones.find(
      (z) => normalizeZoneKey(z) === normNew,
    );
    if (duplicate) {
      setLocalError(
        `Khu vực "${trimmed}" bị trùng với khu vực đã có "${duplicate}".`,
      );
      return;
    }
    setLocalError("");
    onAddZone(trimmed);
    onChange(trimmed);
    setNewZoneText("");
    setAddingNew(false);
  }

  return (
    <div className="field">
      <label htmlFor={id}>Khu vực đặt máy (Zone) *</label>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <select
          id={id}
          value={value}
          onChange={(e) => {
            if (e.target.value === "__ADD_NEW__") {
              setAddingNew(true);
              setLocalError("");
            } else {
              onChange(e.target.value);
            }
          }}
          style={{ flex: 1 }}
          aria-invalid={Boolean(errorMessage || localError)}
        >
          {availableZones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
          <option value="__ADD_NEW__">+ Thêm khu vực mới...</option>
        </select>
        {!addingNew && (
          <button
            type="button"
            className="button outline"
            onClick={() => {
              setAddingNew(true);
              setLocalError("");
            }}
            style={{ whiteSpace: "nowrap", height: "40px" }}
          >
            + Khu vực mới
          </button>
        )}
      </div>

      {addingNew && (
        <div
          style={{
            marginTop: "0.5rem",
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
          }}
        >
          <input
            type="text"
            value={newZoneText}
            onChange={(e) => {
              setNewZoneText(e.target.value);
              setLocalError("");
            }}
            placeholder="Nhập tên khu vực mới (VD: Tầng 3 - Khu Boxing)"
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="button primary"
            onClick={handleConfirmAddZone}
          >
            Thêm
          </button>
          <button
            type="button"
            className="button outline"
            onClick={() => {
              setAddingNew(false);
              setNewZoneText("");
              setLocalError("");
            }}
          >
            Hủy
          </button>
        </div>
      )}

      <FieldError
        id={`${id}-err`}
        message={localError || errorMessage}
      />
    </div>
  );
}

const categoryLabel: Record<EquipmentCategory, string> = {
  CARDIO: "Cardio (Máy chạy, xe đạp, elip)",
  STRENGTH: "Strength (Máy tập cơ cố định)",
  FREE_WEIGHT: "Free Weight (Tạ đơn, tạ đòn, ghế)",
  FUNCTIONAL: "Functional (Khung cáp, phụ kiện)",
};

const categoryShortLabel: Record<EquipmentCategory, string> = {
  CARDIO: "Cardio",
  STRENGTH: "Strength",
  FREE_WEIGHT: "Free Weight",
  FUNCTIONAL: "Functional",
};

const statusLabel: Record<EquipmentStatus, string> = {
  OPERATIONAL: "Đang hoạt động",
  OUT_OF_ORDER: "Đang hỏng / Bảo trì",
  RETIRED: "Ngưng sử dụng",
};

const severityLabel: Record<IncidentSeverity, string> = {
  LOW: "Thấp (Hao mòn nhẹ)",
  MEDIUM: "Trung bình (Cần sửa chữa)",
  HIGH: "Nghiêm trọng (Ngừng vận hành ngay)",
};

function formatDate(value?: string | null) {
  if (!value) return "Chưa cập nhật";
  const formatted = isoToDdMmYyyy(value);
  if (formatted && /^\d{2}\/\d{2}\/\d{4}$/.test(formatted)) {
    return formatted;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function EquipmentStatusBadge({ status }: { status: EquipmentStatus }) {
  const tone =
    status === "OPERATIONAL"
      ? "success"
      : status === "OUT_OF_ORDER"
        ? "warning"
        : "danger";
  return <Badge tone={tone}>{statusLabel[status]}</Badge>;
}

interface CreateEquipmentFormState {
  name: string;
  category: EquipmentCategory;
  zone: string;
  purchasedAt: string;
  warrantyUntil: string;
  notes: string;
}

const initialCreateForm: CreateEquipmentFormState = {
  name: "",
  category: "CARDIO",
  zone: "Tầng 1 - Khu Cardio",
  purchasedAt: new Date().toISOString().slice(0, 10),
  warrantyUntil: "",
  notes: "",
};

export function EquipmentsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<EquipmentDto[]>([]);
  const [overview, setOverview] = useState<EquipmentOverviewDto | null>(null);
  const [zones, setZones] = useState<string[]>([]);
  const [customZones, setCustomZones] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<
    "ALL" | EquipmentCategory
  >("ALL");
  const [zoneFilter, setZoneFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | EquipmentStatus>(
    "ALL",
  );

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateEquipmentFormState>(initialCreateForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);
  const [createdItem, setCreatedItem] = useState<EquipmentDetailDto | null>(
    null,
  );

  const availableZones = useMemo(() => {
    const map = new Map<string, string>();
    for (const z of [...DEFAULT_ZONES, ...zones, ...customZones]) {
      const k = normalizeZoneKey(z);
      if (k && !map.has(k)) {
        map.set(k, z);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, "vi"));
  }, [zones, customZones]);

  async function loadEquipments() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (categoryFilter !== "ALL") params.set("category", categoryFilter);
      if (zoneFilter !== "ALL") params.set("zone", zoneFilter);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      const page = await apiService.getEquipments(params.toString());
      setItems(page.items);
      setOverview(page.overview);
      setZones(page.zones);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Không thể tải danh mục thiết bị phòng tập.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadEquipments();
    }, 200);
    return () => window.clearTimeout(timer);
  }, [q, categoryFilter, zoneFilter, statusFilter]);

  function resetAllFilters() {
    setQ("");
    setCategoryFilter("ALL");
    setZoneFilter("ALL");
    setStatusFilter("ALL");
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setFieldErrors({});
    setSaveError("");
    setNotice("");

    const payload: CreateEquipmentRequest = {
      name: form.name.trim(),
      category: form.category,
      zone: form.zone.trim(),
      purchasedAt: form.purchasedAt || null,
      warrantyUntil: form.warrantyUntil || null,
      notes: form.notes.trim() || null,
    };

    try {
      const created = await apiService.createEquipment(payload);
      setCreatedItem(created);
      setNotice(
        `Đã thêm thiết bị mới "${created.name}" với mã định danh ${created.code}.`,
      );
      setShowCreate(false);
      setForm(initialCreateForm);
      await loadEquipments();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.body.fieldErrors) setFieldErrors(err.body.fieldErrors);
        setSaveError(err.message);
      } else {
        setSaveError("Không thể lưu thiết bị mới.");
      }
    } finally {
      setBusy(false);
    }
  }

  const overviewCards = [
    {
      title: "Tổng số thiết bị",
      value: overview?.total,
      hint: "Toàn bộ máy móc, dụng cụ trong phòng tập",
    },
    {
      title: "Đang hoạt động",
      value: overview?.operational,
      hint: "Sẵn sàng phục vụ hội viên tập luyện",
    },
    {
      title: "Đang hỏng / Bảo trì",
      value: overview?.outOfOrder,
      hint: "Có sự cố đang mở, chờ kỹ thuật nghiệm thu",
    },
    {
      title: "Ngưng sử dụng",
      value: overview?.retired,
      hint: "Thiết bị đã thanh lý, khóa thao tác vĩnh viễn",
    },
  ];

  const hasActiveFilter =
    Boolean(q.trim()) ||
    categoryFilter !== "ALL" ||
    zoneFilter !== "ALL" ||
    statusFilter !== "ALL";

  return (
    <>
      <PageHeading
        section="Thiết bị"
        title="Quản lý thiết bị phòng tập"
        description="Theo dõi tình trạng vận hành, cấp mã QR định danh tĩnh, ghi nhận sự cố hỏng hóc và sổ lịch sử bảo trì."
        action={
          <button
            type="button"
            className="button primary"
            onClick={() => {
              setShowCreate((prev) => !prev);
              setCreatedItem(null);
              setFieldErrors({});
              setSaveError("");
            }}
          >
            <Plus size={18} aria-hidden="true" /> Thêm thiết bị mới
          </button>
        }
      />

      {notice && <Notice>{notice}</Notice>}
      {error && <Notice error>{error}</Notice>}

      <section
        className="member-overview"
        aria-label="Tổng quan thiết bị"
        aria-busy={!overview}
      >
        {overviewCards.map((card) => (
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

      {createdItem && (
        <section
          className="panel"
          style={{
            marginBottom: "1.5rem",
            borderLeft: "4px solid var(--accent, #2563eb)",
          }}
          aria-label="Tem QR thiết bị vừa khởi tạo"
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
              <QrCodeGraphic payload={createdItem.qrCodePayload} size={96} />
              <div>
                <h2 style={{ marginTop: 0, marginBottom: "0.35rem" }}>
                  Tem định danh QR tĩnh vừa cấp: <code>{createdItem.code}</code>
                </h2>
                <p style={{ margin: "0 0 0.5rem", color: "#475569" }}>
                  Thiết bị: <strong>{createdItem.name}</strong> · Khu vực:{" "}
                  <strong>{createdItem.zone}</strong>
                </p>
                <p style={{ margin: 0, fontSize: "0.9rem" }}>
                  Chuỗi QR tĩnh bất biến:{" "}
                  <code
                    style={{
                      background: "#f1f5f9",
                      padding: "0.2rem 0.45rem",
                      borderRadius: "4px",
                    }}
                  >
                    {createdItem.qrCodePayload}
                  </code>
                </p>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                className="button outline"
                onClick={() => navigate(`/equipments/${createdItem.id}`)}
              >
                <QrCode size={16} aria-hidden="true" /> Xem & In tem QR
              </button>
              <button
                type="button"
                className="button outline"
                onClick={() => setCreatedItem(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        </section>
      )}

      {showCreate && (
        <section className="panel" style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ marginTop: 0 }}>Thêm thiết bị phòng tập mới</h2>
          <p style={{ color: "#64748b", marginTop: "-0.25rem" }}>
            Hệ thống sẽ tự động sinh mã định danh{" "}
            <code>EQ-&lt;NHÓM&gt;-&lt;STT&gt;</code> và chuỗi QR tĩnh bất biến ở
            trạng thái <strong>Đang hoạt động</strong>.
          </p>
          {saveError && <Notice error>{saveError}</Notice>}

          <form onSubmit={(e) => void handleCreate(e)} noValidate>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="eq-name">Tên thiết bị *</label>
                <input
                  id="eq-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="VD: Máy chạy bộ LifeFitness T5 #03"
                  aria-invalid={Boolean(fieldErrors.name)}
                />
                <FieldError id="err-eq-name" message={fieldErrors.name} />
              </div>

              <div className="field">
                <label htmlFor="eq-category">Nhóm thiết bị *</label>
                <select
                  id="eq-category"
                  value={form.category}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      category: e.target.value as EquipmentCategory,
                    })
                  }
                >
                  <option value="CARDIO">{categoryLabel.CARDIO}</option>
                  <option value="STRENGTH">{categoryLabel.STRENGTH}</option>
                  <option value="FREE_WEIGHT">
                    {categoryLabel.FREE_WEIGHT}
                  </option>
                  <option value="FUNCTIONAL">{categoryLabel.FUNCTIONAL}</option>
                </select>
                <FieldError
                  id="err-eq-category"
                  message={fieldErrors.category}
                />
              </div>

              <ZoneSelectorField
                id="eq-zone"
                value={form.zone}
                availableZones={availableZones}
                onChange={(zone) => setForm({ ...form, zone })}
                onAddZone={(newZone) =>
                  setCustomZones((prev) => [...prev, newZone])
                }
                errorMessage={fieldErrors.zone}
              />

              <div className="field">
                <label htmlFor="eq-purchased">Ngày nhập máy (dd/MM/yyyy)</label>
                <DateInputDdMmYyyy
                  id="eq-purchased"
                  valueIso={form.purchasedAt}
                  onChangeIso={(purchasedAt) =>
                    setForm({ ...form, purchasedAt })
                  }
                  ariaInvalid={Boolean(fieldErrors.purchasedAt)}
                />
                <FieldError
                  id="err-eq-purchased"
                  message={fieldErrors.purchasedAt}
                />
              </div>

              <div className="field">
                <label htmlFor="eq-warranty">Hạn bảo hành (dd/MM/yyyy)</label>
                <DateInputDdMmYyyy
                  id="eq-warranty"
                  valueIso={form.warrantyUntil}
                  onChangeIso={(warrantyUntil) =>
                    setForm({ ...form, warrantyUntil })
                  }
                  ariaInvalid={Boolean(fieldErrors.warrantyUntil)}
                />
                <FieldError
                  id="err-eq-warranty"
                  message={fieldErrors.warrantyUntil}
                />
              </div>

              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="eq-notes">Ghi chú kỹ thuật</label>
                <input
                  id="eq-notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Thông số nguồn điện, nhà cung cấp bảo hành, lưu ý bảo dưỡng..."
                />
                <FieldError id="err-eq-notes" message={fieldErrors.notes} />
              </div>
            </div>

            <div
              className="form-actions"
              style={{ marginTop: "1.25rem", display: "flex", gap: "0.75rem" }}
            >
              <button type="submit" className="button primary" disabled={busy}>
                {busy ? "Đang khởi tạo..." : "Lưu & Cấp mã QR"}
              </button>
              <button
                type="button"
                className="button outline"
                onClick={() => setShowCreate(false)}
                disabled={busy}
              >
                Hủy
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="equipment-filter-panel">
          <div className="equipment-filter-row-1">
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="filter-eq-search">Tìm kiếm thiết bị</label>
              <div className="equipment-search-box">
                <Search
                  size={16}
                  aria-hidden="true"
                  className="equipment-search-icon"
                />
                <input
                  id="filter-eq-search"
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Tìm theo mã thiết bị (EQ-...) hoặc tên máy..."
                  aria-label="Tìm kiếm thiết bị"
                />
              </div>
            </div>

            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="filter-eq-category">Nhóm thiết bị</label>
              <select
                id="filter-eq-category"
                aria-label="Lọc theo nhóm thiết bị"
                value={categoryFilter}
                onChange={(e) =>
                  setCategoryFilter(e.target.value as "ALL" | EquipmentCategory)
                }
              >
                <option value="ALL">Tất cả nhóm máy</option>
                <option value="CARDIO">Cardio</option>
                <option value="STRENGTH">Strength</option>
                <option value="FREE_WEIGHT">Free Weight</option>
                <option value="FUNCTIONAL">Functional</option>
              </select>
            </div>

            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="filter-eq-zone">Khu vực</label>
              <select
                id="filter-eq-zone"
                aria-label="Lọc theo khu vực"
                value={zoneFilter}
                onChange={(e) => setZoneFilter(e.target.value)}
              >
                <option value="ALL">Tất cả khu vực</option>
                {availableZones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            className="equipment-status-tabs"
            role="tablist"
            aria-label="Lọc theo trạng thái thiết bị"
          >
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === "ALL"}
              className={`equipment-status-tab ${statusFilter === "ALL" ? "active" : ""}`}
              onClick={() => setStatusFilter("ALL")}
            >
              Tất cả ({overview?.total ?? items.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === "OPERATIONAL"}
              className={`equipment-status-tab ${statusFilter === "OPERATIONAL" ? "active" : ""}`}
              onClick={() => setStatusFilter("OPERATIONAL")}
            >
              <span className="status-dot success" aria-hidden="true" />
              Đang hoạt động ({overview?.operational ?? 0})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === "OUT_OF_ORDER"}
              className={`equipment-status-tab ${statusFilter === "OUT_OF_ORDER" ? "active" : ""}`}
              onClick={() => setStatusFilter("OUT_OF_ORDER")}
            >
              <span className="status-dot warning" aria-hidden="true" />
              Đang bảo trì ({overview?.outOfOrder ?? 0})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === "RETIRED"}
              className={`equipment-status-tab ${statusFilter === "RETIRED" ? "active" : ""}`}
              onClick={() => setStatusFilter("RETIRED")}
            >
              <span className="status-dot danger" aria-hidden="true" />
              Ngưng sử dụng ({overview?.retired ?? 0})
            </button>
          </div>

          <div className="equipment-filter-summary">
            <span>
              Hiển thị <strong>{items.length}</strong> thiết bị
            </span>
            <button
              type="button"
              className="button outline"
              disabled={!hasActiveFilter}
              onClick={resetAllFilters}
              style={{ height: "34px", padding: "0 0.75rem" }}
            >
              <RotateCcw size={14} aria-hidden="true" /> Xóa bộ lọc
            </button>
          </div>
        </div>

        {loading ? (
          <p role="status">Đang tải danh mục thiết bị…</p>
        ) : items.length === 0 ? (
          <Empty
            title="Không có thiết bị phù hợp"
            description="Hãy điều chỉnh bộ lọc hoặc thêm thiết bị mới vào phòng tập."
            action={
              hasActiveFilter ? (
                <button
                  type="button"
                  className="button outline"
                  onClick={resetAllFilters}
                >
                  Xóa bộ lọc
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="table equipment-table">
              <thead>
                <tr>
                  <th>Mã thiết bị</th>
                  <th>Tên thiết bị</th>
                  <th>Nhóm máy</th>
                  <th>Khu vực (Zone)</th>
                  <th>Bảo hành đến</th>
                  <th>Trạng thái vận hành</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map((eq) => (
                  <tr key={eq.id}>
                    <td>
                      <code>{eq.code}</code>
                    </td>
                    <td style={{ whiteSpace: "normal", minWidth: "220px" }}>
                      <strong>{eq.name}</strong>
                      {eq.openIncident && (
                        <div
                          style={{
                            fontSize: "0.82rem",
                            color: "#b45309",
                            marginTop: "0.2rem",
                            whiteSpace: "normal",
                          }}
                        >
                          Sự cố mở ({eq.openIncident.severity}):{" "}
                          {eq.openIncident.description}
                        </div>
                      )}
                    </td>
                    <td>{categoryShortLabel[eq.category]}</td>
                    <td style={{ whiteSpace: "normal" }}>{eq.zone}</td>
                    <td>{formatDate(eq.warrantyUntil)}</td>
                    <td>
                      <EquipmentStatusBadge status={eq.status} />
                    </td>
                    <td>
                      <div
                        className="member-row-actions"
                        style={{ justifyContent: "flex-start", gap: 8 }}
                      >
                        <Link
                          className="member-action"
                          to={`/equipments/${eq.id}`}
                          aria-label={`Xem chi tiết ${eq.code}`}
                          title="Xem chi tiết & Bảo trì"
                        >
                          <Eye size={16} aria-hidden="true" />
                        </Link>
                        {eq.status !== "RETIRED" && (
                          <Link
                            className="member-action"
                            to={`/equipments/${eq.id}?mode=EDIT`}
                            aria-label={`Cập nhật ${eq.code}`}
                            title="Cập nhật thông tin"
                          >
                            <Edit3 size={16} aria-hidden="true" />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

type ActionModalMode = "NONE" | "EDIT" | "INCIDENT" | "RESOLVE" | "RETIRE";

export function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [equipment, setEquipment] = useState<EquipmentDetailDto | null>(null);
  const [customZones, setCustomZones] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<ActionModalMode>(() =>
    searchParams.get("mode") === "EDIT" ? "EDIT" : "NONE",
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form states
  const [editForm, setEditForm] = useState<{
    name: string;
    zone: string;
    purchasedAt: string;
    warrantyUntil: string;
    notes: string;
  }>({
    name: "",
    zone: "",
    purchasedAt: "",
    warrantyUntil: "",
    notes: "",
  });

  const [incidentForm, setIncidentForm] = useState<{
    description: string;
    severity: IncidentSeverity;
  }>({
    description: "",
    severity: "MEDIUM",
  });

  const [resolveForm, setResolveForm] = useState<{
    resolutionNote: string;
    nextStatus: "OPERATIONAL" | "RETIRED";
  }>({
    resolutionNote: "",
    nextStatus: "OPERATIONAL",
  });

  const [retireReason, setRetireReason] = useState("");

  const availableZones = useMemo(() => {
    const map = new Map<string, string>();
    const list = [
      ...DEFAULT_ZONES,
      ...(equipment?.zone ? [equipment.zone] : []),
      ...customZones,
    ];
    for (const z of list) {
      const k = normalizeZoneKey(z);
      if (k && !map.has(k)) {
        map.set(k, z);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, "vi"));
  }, [equipment?.zone, customZones]);

  async function loadDetail() {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const detail = await apiService.getEquipment(id);
      setEquipment(detail);
      setEditForm({
        name: detail.name,
        zone: detail.zone,
        purchasedAt: detail.purchasedAt ? detail.purchasedAt.slice(0, 10) : "",
        warrantyUntil: detail.warrantyUntil
          ? detail.warrantyUntil.slice(0, 10)
          : "",
        notes: detail.notes || "",
      });
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Không thể tải hồ sơ chi tiết thiết bị.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDetail();
  }, [id]);

  function openMode(next: ActionModalMode) {
    setActionError("");
    setFieldErrors({});
    setNotice("");
    setMode(next);
    if (searchParams.has("mode")) {
      setSearchParams({}, { replace: true });
    }
  }

  async function handleUpdateSubmit(e: FormEvent) {
    e.preventDefault();
    if (!id || busy) return;
    setBusy(true);
    setActionError("");
    setFieldErrors({});
    const payload: UpdateEquipmentRequest = {
      name: editForm.name.trim(),
      zone: editForm.zone.trim(),
      purchasedAt: editForm.purchasedAt || null,
      warrantyUntil: editForm.warrantyUntil || null,
      notes: editForm.notes.trim() || null,
    };
    try {
      const updated = await apiService.updateEquipment(id, payload);
      setEquipment(updated);
      setMode("NONE");
      setNotice("Đã cập nhật thông tin thiết bị thành công.");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.body.fieldErrors) setFieldErrors(err.body.fieldErrors);
        setActionError(err.message);
      } else {
        setActionError("Không thể cập nhật thiết bị.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleIncidentSubmit(e: FormEvent) {
    e.preventDefault();
    if (!id || busy) return;
    setBusy(true);
    setActionError("");
    setFieldErrors({});
    const payload: CreateIncidentRequest = {
      description: incidentForm.description.trim(),
      severity: incidentForm.severity,
    };
    try {
      const updated = await apiService.reportEquipmentIncident(id, payload);
      setEquipment(updated);
      setIncidentForm({ description: "", severity: "MEDIUM" });
      setMode("NONE");
      setNotice(
        "Đã ghi nhận sự cố hỏng hóc và chuyển thiết bị sang trạng thái Đang hỏng / Bảo trì.",
      );
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.body.fieldErrors) setFieldErrors(err.body.fieldErrors);
        setActionError(err.message);
      } else {
        setActionError("Không thể báo hỏng thiết bị.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleResolveSubmit(e: FormEvent) {
    e.preventDefault();
    if (!id || busy) return;
    setBusy(true);
    setActionError("");
    setFieldErrors({});
    const payload: ResolveMaintenanceRequest = {
      resolutionNote: resolveForm.resolutionNote.trim(),
      nextStatus: resolveForm.nextStatus,
    };
    try {
      const updated = await apiService.resolveEquipmentMaintenance(id, payload);
      setEquipment(updated);
      setResolveForm({ resolutionNote: "", nextStatus: "OPERATIONAL" });
      setMode("NONE");
      setNotice(
        payload.nextStatus === "OPERATIONAL"
          ? "Đã nghiệm thu bảo trì và đưa thiết bị trở lại hoạt động."
          : "Đã nghiệm thu kết thúc bảo trì và thanh lý thiết bị vĩnh viễn.",
      );
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.body.fieldErrors) setFieldErrors(err.body.fieldErrors);
        setActionError(err.message);
      } else {
        setActionError("Không thể nghiệm thu bảo trì.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRetireSubmit(e: FormEvent) {
    e.preventDefault();
    if (!id || busy) return;
    setBusy(true);
    setActionError("");
    setFieldErrors({});
    const payload: RetireEquipmentRequest = {
      reason: retireReason.trim(),
    };
    try {
      const updated = await apiService.retireEquipment(id, payload);
      setEquipment(updated);
      setRetireReason("");
      setMode("NONE");
      setNotice(
        "Thiết bị đã được chuyển sang trạng thái Ngưng sử dụng vĩnh viễn (RETIRED). Theo quy tắc BR04, thiết bị chỉ cho phép tra cứu lịch sử.",
      );
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.body.fieldErrors) setFieldErrors(err.body.fieldErrors);
        setActionError(err.message);
      } else {
        setActionError("Không thể thanh lý thiết bị.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <>
        <PageHeading
          section="Thiết bị"
          title="Hồ sơ thiết bị"
          back="/equipments"
        />
        <p role="status">Đang tải hồ sơ thiết bị…</p>
      </>
    );
  }

  if (error || !equipment) {
    return (
      <>
        <PageHeading
          section="Thiết bị"
          title="Không tìm thấy thiết bị"
          back="/equipments"
        />
        <Notice error>{error || "Hồ sơ thiết bị không tồn tại."}</Notice>
      </>
    );
  }

  const isRetired = equipment.status === "RETIRED";
  const isOutOfOrder = equipment.status === "OUT_OF_ORDER";
  const isOperational = equipment.status === "OPERATIONAL";

  return (
    <>
      <PageHeading
        section="Thiết bị"
        back="/equipments"
        title={`${equipment.name} (${equipment.code})`}
        description={`Nhóm: ${categoryLabel[equipment.category]} · Khu vực: ${equipment.zone}`}
        action={
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {!isRetired && (
              <button
                type="button"
                className="button outline"
                onClick={() => openMode(mode === "EDIT" ? "NONE" : "EDIT")}
              >
                <Edit3 size={16} aria-hidden="true" /> Cập nhật thông tin
              </button>
            )}
            {isOperational && (
              <button
                type="button"
                className="button primary"
                onClick={() =>
                  openMode(mode === "INCIDENT" ? "NONE" : "INCIDENT")
                }
              >
                <Wrench size={16} aria-hidden="true" /> Báo hỏng thiết bị
              </button>
            )}
            {isOutOfOrder && (
              <button
                type="button"
                className="button primary"
                onClick={() =>
                  openMode(mode === "RESOLVE" ? "NONE" : "RESOLVE")
                }
              >
                <CheckCircle2 size={16} aria-hidden="true" /> Nghiệm thu bảo trì
              </button>
            )}
            {!isRetired && (
              <button
                type="button"
                className="button outline"
                onClick={() => openMode(mode === "RETIRE" ? "NONE" : "RETIRE")}
              >
                <ArchiveX size={16} aria-hidden="true" /> Thanh lý / Ngưng sử
                dụng
              </button>
            )}
          </div>
        }
      />

      {notice && <Notice>{notice}</Notice>}

      {mode === "EDIT" && !isRetired && (
        <section className="panel" style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ marginTop: 0 }}>
            Cập nhật thông tin thiết bị ({equipment.code})
          </h2>
          <p style={{ color: "#64748b", marginTop: "-0.25rem" }}>
            Mã định danh <code>{equipment.code}</code> và chuỗi QR tĩnh{" "}
            <code>{equipment.qrCodePayload}</code> là bất biến (<code>BR01</code>
            ).
          </p>
          {actionError && <Notice error>{actionError}</Notice>}
          <form onSubmit={(e) => void handleUpdateSubmit(e)} noValidate>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="edit-eq-name">Tên thiết bị *</label>
                <input
                  id="edit-eq-name"
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                />
                <FieldError id="err-edit-name" message={fieldErrors.name} />
              </div>

              <ZoneSelectorField
                id="edit-eq-zone"
                value={editForm.zone}
                availableZones={availableZones}
                onChange={(zone) => setEditForm({ ...editForm, zone })}
                onAddZone={(newZone) =>
                  setCustomZones((prev) => [...prev, newZone])
                }
                errorMessage={fieldErrors.zone}
              />

              <div className="field">
                <label htmlFor="edit-eq-purchased">
                  Ngày nhập máy (dd/MM/yyyy)
                </label>
                <DateInputDdMmYyyy
                  id="edit-eq-purchased"
                  valueIso={editForm.purchasedAt}
                  onChangeIso={(purchasedAt) =>
                    setEditForm({ ...editForm, purchasedAt })
                  }
                  ariaInvalid={Boolean(fieldErrors.purchasedAt)}
                />
                <FieldError
                  id="err-edit-purchased"
                  message={fieldErrors.purchasedAt}
                />
              </div>

              <div className="field">
                <label htmlFor="edit-eq-warranty">
                  Hạn bảo hành (dd/MM/yyyy)
                </label>
                <DateInputDdMmYyyy
                  id="edit-eq-warranty"
                  valueIso={editForm.warrantyUntil}
                  onChangeIso={(warrantyUntil) =>
                    setEditForm({ ...editForm, warrantyUntil })
                  }
                  ariaInvalid={Boolean(fieldErrors.warrantyUntil)}
                />
                <FieldError
                  id="err-edit-warranty"
                  message={fieldErrors.warrantyUntil}
                />
              </div>

              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="edit-eq-notes">Ghi chú kỹ thuật</label>
                <input
                  id="edit-eq-notes"
                  value={editForm.notes}
                  onChange={(e) =>
                    setEditForm({ ...editForm, notes: e.target.value })
                  }
                />
              </div>
            </div>

            <div
              className="form-actions"
              style={{ marginTop: "1rem", display: "flex", gap: "0.75rem" }}
            >
              <button type="submit" className="button primary" disabled={busy}>
                {busy ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
              <button
                type="button"
                className="button outline"
                onClick={() => openMode("NONE")}
              >
                Hủy
              </button>
            </div>
          </form>
        </section>
      )}

      {mode === "INCIDENT" && isOperational && (
        <section className="panel" style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ marginTop: 0 }}>
            <AlertTriangle
              size={20}
              style={{ verticalAlign: "text-bottom", marginRight: "0.35rem" }}
            />
            Báo hỏng thiết bị ({equipment.code})
          </h2>
          <p style={{ color: "#64748b", marginTop: "-0.25rem" }}>
            Thiết bị sẽ lập tức chuyển sang trạng thái{" "}
            <strong>Đang hỏng / Bảo trì (OUT_OF_ORDER)</strong> cho đến khi được
            nghiệm thu.
          </p>
          {actionError && <Notice error>{actionError}</Notice>}
          <form onSubmit={(e) => void handleIncidentSubmit(e)} noValidate>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="inc-severity">Mức độ nghiêm trọng *</label>
                <select
                  id="inc-severity"
                  value={incidentForm.severity}
                  onChange={(e) =>
                    setIncidentForm({
                      ...incidentForm,
                      severity: e.target.value as IncidentSeverity,
                    })
                  }
                >
                  <option value="LOW">{severityLabel.LOW}</option>
                  <option value="MEDIUM">{severityLabel.MEDIUM}</option>
                  <option value="HIGH">{severityLabel.HIGH}</option>
                </select>
                <FieldError
                  id="err-inc-severity"
                  message={fieldErrors.severity}
                />
              </div>

              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="inc-desc">Mô tả tình trạng hỏng hóc *</label>
                <input
                  id="inc-desc"
                  value={incidentForm.description}
                  onChange={(e) =>
                    setIncidentForm({
                      ...incidentForm,
                      description: e.target.value,
                    })
                  }
                  placeholder="VD: Đứt dây cáp kéo xô, bảng điều khiển báo lỗi E04..."
                />
                <FieldError
                  id="err-inc-desc"
                  message={fieldErrors.description}
                />
              </div>
            </div>

            <div
              className="form-actions"
              style={{ marginTop: "1rem", display: "flex", gap: "0.75rem" }}
            >
              <button type="submit" className="button primary" disabled={busy}>
                {busy
                  ? "Đang ghi nhận..."
                  : "Xác nhận báo hỏng & Chuyển bảo trì"}
              </button>
              <button
                type="button"
                className="button outline"
                onClick={() => openMode("NONE")}
              >
                Hủy
              </button>
            </div>
          </form>
        </section>
      )}

      {mode === "RESOLVE" && isOutOfOrder && (
        <section className="panel" style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ marginTop: 0 }}>
            Nghiệm thu bảo trì thiết bị ({equipment.code})
          </h2>
          <p style={{ color: "#64748b", marginTop: "-0.25rem" }}>
            Nhập biên bản kết quả sửa chữa (bắt buộc theo quy tắc{" "}
            <code>BR03</code>) để đóng phiếu sự cố đang mở.
          </p>
          {actionError && <Notice error>{actionError}</Notice>}
          <form onSubmit={(e) => void handleResolveSubmit(e)} noValidate>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="res-next-status">
                  Trạng thái sau nghiệm thu *
                </label>
                <select
                  id="res-next-status"
                  value={resolveForm.nextStatus}
                  onChange={(e) =>
                    setResolveForm({
                      ...resolveForm,
                      nextStatus: e.target.value as "OPERATIONAL" | "RETIRED",
                    })
                  }
                >
                  <option value="OPERATIONAL">
                    Đưa trở lại hoạt động (OPERATIONAL)
                  </option>
                  <option value="RETIRED">
                    Không thể phục hồi — Thanh lý vĩnh viễn (RETIRED)
                  </option>
                </select>
                <FieldError
                  id="err-res-status"
                  message={fieldErrors.nextStatus}
                />
              </div>

              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="res-note">
                  Biên bản nghiệm thu / Kết quả xử lý *
                </label>
                <input
                  id="res-note"
                  value={resolveForm.resolutionNote}
                  onChange={(e) =>
                    setResolveForm({
                      ...resolveForm,
                      resolutionNote: e.target.value,
                    })
                  }
                  placeholder="VD: Đã thay dây curoa chính hãng, cân chỉnh motor và chạy thử tải 120kg ổn định."
                />
                <FieldError
                  id="err-res-note"
                  message={fieldErrors.resolutionNote}
                />
              </div>
            </div>

            <div
              className="form-actions"
              style={{ marginTop: "1rem", display: "flex", gap: "0.75rem" }}
            >
              <button type="submit" className="button primary" disabled={busy}>
                {busy ? "Đang lưu nghiệm thu..." : "Hoàn tất nghiệm thu"}
              </button>
              <button
                type="button"
                className="button outline"
                onClick={() => openMode("NONE")}
              >
                Hủy
              </button>
            </div>
          </form>
        </section>
      )}

      {mode === "RETIRE" && !isRetired && (
        <section className="panel" style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ marginTop: 0 }}>
            Thanh lý / Ngưng sử dụng vĩnh viễn ({equipment.code})
          </h2>
          <p style={{ color: "#b91c1c", marginTop: "-0.25rem" }}>
            Lưu ý (<code>BR04</code>): Sau khi chuyển sang trạng thái{" "}
            <strong>Ngưng sử dụng (RETIRED)</strong>, thiết bị không thể kích
            hoạt lại.
          </p>
          {actionError && <Notice error>{actionError}</Notice>}
          <form onSubmit={(e) => void handleRetireSubmit(e)} noValidate>
            <div className="field">
              <label htmlFor="retire-reason">
                Lý do thanh lý / ngưng sử dụng *
              </label>
              <input
                id="retire-reason"
                value={retireReason}
                onChange={(e) => setRetireReason(e.target.value)}
                placeholder="VD: Hết khấu hao sử dụng, xuất kho thanh lý đợt Q4/2026..."
              />
              <FieldError id="err-retire-reason" message={fieldErrors.reason} />
            </div>

            <div
              className="form-actions"
              style={{ marginTop: "1rem", display: "flex", gap: "0.75rem" }}
            >
              <button type="submit" className="button primary" disabled={busy}>
                {busy
                  ? "Đang xử lý..."
                  : "Xác nhận Ngưng sử dụng vĩnh viễn"}
              </button>
              <button
                type="button"
                className="button outline"
                onClick={() => openMode("NONE")}
              >
                Hủy
              </button>
            </div>
          </form>
        </section>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "1.25rem",
          marginBottom: "1.5rem",
        }}
      >
        <section className="panel">
          <h2 style={{ marginTop: 0 }}>Thông số hồ sơ thiết bị</h2>
          <dl className="info-rows">
            <div>
              <dt>Mã định danh</dt>
              <dd>
                <code>{equipment.code}</code>
              </dd>
            </div>
            <div>
              <dt>Tên thiết bị</dt>
              <dd>
                <strong>{equipment.name}</strong>
              </dd>
            </div>
            <div>
              <dt>Nhóm máy</dt>
              <dd>{categoryLabel[equipment.category]}</dd>
            </div>
            <div>
              <dt>Khu vực lắp đặt</dt>
              <dd>{equipment.zone}</dd>
            </div>
            <div>
              <dt>Trạng thái hiện tại</dt>
              <dd>
                <EquipmentStatusBadge status={equipment.status} />
                {isRetired && (
                  <div
                    style={{
                      marginTop: "0.35rem",
                      fontSize: "0.82rem",
                      color: "#64748b",
                    }}
                  >
                    Chỉ tra cứu lịch sử, đã khóa chỉnh sửa vĩnh viễn (
                    <code>BR04</code>).
                  </div>
                )}
              </dd>
            </div>
            <div>
              <dt>Ngày nhập máy</dt>
              <dd>{formatDate(equipment.purchasedAt)}</dd>
            </div>
            <div>
              <dt>Hạn bảo hành</dt>
              <dd>{formatDate(equipment.warrantyUntil)}</dd>
            </div>
            <div>
              <dt>Ghi chú kỹ thuật</dt>
              <dd>{equipment.notes || "Không có ghi chú"}</dd>
            </div>
          </dl>
        </section>

        <section
          className="panel qr-label-panel"
          aria-label="Tem QR định danh tĩnh"
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h2 className="no-print" style={{ marginTop: 0 }}>
              Tem QR định danh tĩnh (In dán máy)
            </h2>
            <p
              className="no-print"
              style={{ color: "#64748b", fontSize: "0.9rem" }}
            >
              Dùng để dán trực tiếp lên thân máy phục vụ kiểm kê và tra cứu
              nhanh lịch sử bảo trì.
            </p>
            <div
              className="printable-qr-label"
              style={{
                border: "2px dashed #94a3b8",
                borderRadius: "12px",
                padding: "1.25rem",
                background: "#f8fafc",
                textAlign: "center",
                margin: "1rem 0",
              }}
            >
              <div style={{ marginBottom: "0.75rem" }}>
                <QrCodeGraphic payload={equipment.qrCodePayload} size={156} />
              </div>
              <div style={{ fontWeight: 700, fontSize: "1.15rem" }}>
                {equipment.code}
              </div>
              <div style={{ color: "#334155", marginTop: "0.2rem" }}>
                {equipment.name}
              </div>
              <div
                style={{
                  color: "#64748b",
                  fontSize: "0.85rem",
                  marginTop: "0.15rem",
                }}
              >
                Khu vực: {equipment.zone}
              </div>
              <div style={{ marginTop: "0.6rem" }}>
                <code
                  style={{
                    fontSize: "0.82rem",
                    background: "#e2e8f0",
                    padding: "0.2rem 0.5rem",
                    borderRadius: "4px",
                  }}
                >
                  {equipment.qrCodePayload}
                </code>
              </div>
            </div>
          </div>

          <div className="no-print">
            <button
              type="button"
              className="button outline"
              onClick={() => window.print()}
            >
              <Printer size={16} aria-hidden="true" /> In tem QR thiết bị
            </button>
          </div>
        </section>
      </div>

      <section className="panel" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ marginTop: 0 }}>
          Danh sách phiếu sự cố & Bảo trì ({equipment.incidents.length})
        </h2>
        {equipment.incidents.length === 0 ? (
          <Empty
            title="Chưa có sự cố nào"
            description="Thiết bị này chưa từng phát sinh báo hỏng hoặc bảo trì."
          />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Thời điểm báo hỏng</th>
                  <th>Mức độ</th>
                  <th>Mô tả sự cố</th>
                  <th>Trạng thái phiếu</th>
                  <th>Biên bản nghiệm thu</th>
                  <th>Thời điểm đóng</th>
                </tr>
              </thead>
              <tbody>
                {equipment.incidents.map((inc) => (
                  <tr key={inc.id}>
                    <td>{formatDateTime(inc.reportedAt)}</td>
                    <td>
                      <Badge
                        tone={
                          inc.severity === "HIGH"
                            ? "danger"
                            : inc.severity === "MEDIUM"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {inc.severity}
                      </Badge>
                    </td>
                    <td>{inc.description}</td>
                    <td>
                      <Badge
                        tone={inc.status === "OPEN" ? "warning" : "success"}
                      >
                        {inc.status === "OPEN" ? "Đang mở" : "Đã nghiệm thu"}
                      </Badge>
                    </td>
                    <td>{inc.resolutionNote || "—"}</td>
                    <td>{formatDateTime(inc.resolvedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2 style={{ marginTop: 0 }}>
          Sổ lịch sử vòng đời thiết bị ({equipment.history.length})
        </h2>
        {equipment.history.length === 0 ? (
          <p>Chưa có bản ghi lịch sử.</p>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Sự kiện</th>
                  <th>Chuyển trạng thái</th>
                  <th>Ghi chú chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {equipment.history.map((h) => (
                  <tr key={h.id}>
                    <td>{formatDateTime(h.createdAt)}</td>
                    <td>
                      <code>{h.action}</code>
                    </td>
                    <td>
                      {h.fromStatus ? `${h.fromStatus} → ` : ""}
                      <strong>{h.toStatus || "—"}</strong>
                    </td>
                    <td>{h.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
