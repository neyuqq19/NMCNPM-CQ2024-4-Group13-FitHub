import { useEffect, useState, type FormEvent } from "react";
import type {
  CreatePackageRequest,
  PackageDto,
  UpdatePackageRequest,
} from "@fithub/contracts";
import { Plus, Edit3, Power } from "lucide-react";
import { Badge, Empty, FieldError, Notice, PageHeading } from "../components";
import { ApiError, apiService } from "../services/api.service";

type AccessWindow = "REGULAR" | "OFF_PEAK";
type DurationMonths = 1 | 3 | 6 | 12;

const money = (value: number) =>
  `${new Intl.NumberFormat("vi-VN").format(value)} đ`;

const accessWindowLabel: Record<AccessWindow, string> = {
  REGULAR: "Toàn khung giờ (05:30–22:00)",
  OFF_PEAK: "Thấp điểm Off-peak (09:00–16:00)",
};

type FilterMode = "ALL" | "ACTIVE" | "INACTIVE";

interface PackageFormState {
  code: string;
  name: string;
  durationMonths: DurationMonths;
  price: string;
  grantsGymAccess: boolean;
  accessWindow: AccessWindow;
  ptSessionsIncluded: string;
  isActive: boolean;
}

const initialFormState: PackageFormState = {
  code: "",
  name: "",
  durationMonths: 1,
  price: "500000",
  grantsGymAccess: true,
  accessWindow: "REGULAR",
  ptSessionsIncluded: "0",
  isActive: true,
};

export function PackagesPage() {
  const [packages, setPackages] = useState<PackageDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<FilterMode>("ALL");

  const [editing, setEditing] = useState<PackageDto | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<PackageFormState>(initialFormState);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadPackages() {
    setLoading(true);
    setError("");
    try {
      const list = await apiService.getPackages(true);
      setPackages(list);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Không thể tải danh mục gói tập.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPackages();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(initialFormState);
    setFieldErrors({});
    setSaveError("");
    setNotice("");
    setShowForm(true);
  }

  function openEdit(pkg: PackageDto) {
    setEditing(pkg);
    const dur: DurationMonths =
      pkg.durationMonths === 3 ||
      pkg.durationMonths === 6 ||
      pkg.durationMonths === 12
        ? pkg.durationMonths
        : 1;
    setForm({
      code: pkg.code,
      name: pkg.name,
      durationMonths: dur,
      price: String(pkg.price),
      grantsGymAccess: pkg.grantsGymAccess,
      accessWindow: pkg.accessWindow || "REGULAR",
      ptSessionsIncluded: String(pkg.ptSessionsIncluded ?? 0),
      isActive: pkg.isActive !== false,
    });
    setFieldErrors({});
    setSaveError("");
    setNotice("");
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setFieldErrors({});
    setSaveError("");
    setNotice("");

    const priceNum = Number(form.price);
    const ptNum = Number(form.ptSessionsIncluded);

    try {
      if (editing) {
        const body: UpdatePackageRequest = {
          name: form.name.trim(),
          durationMonths: form.durationMonths,
          price: priceNum,
          grantsGymAccess: form.grantsGymAccess,
          accessWindow: form.accessWindow,
          ptSessionsIncluded: ptNum,
          isActive: form.isActive,
        };
        const updated = await apiService.updatePackage(editing.id, body);
        setNotice(`Đã cập nhật gói tập "${updated.name}" (${updated.code}).`);
      } else {
        const body: CreatePackageRequest = {
          code: form.code.trim().toUpperCase(),
          name: form.name.trim(),
          durationMonths: form.durationMonths,
          price: priceNum,
          grantsGymAccess: form.grantsGymAccess,
          accessWindow: form.accessWindow,
          ptSessionsIncluded: ptNum,
        };
        const created = await apiService.createPackage(body);
        setNotice(`Đã tạo gói tập mới "${created.name}" (${created.code}).`);
      }
      setShowForm(false);
      setEditing(null);
      await loadPackages();
    } catch (err) {
      if (err instanceof ApiError) {
        setSaveError(err.message);
        if (err.body.fieldErrors) setFieldErrors(err.body.fieldErrors);
      } else {
        setSaveError("Không thể lưu gói tập.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(pkg: PackageDto) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const nextActive = pkg.isActive === false;
      const updated = await apiService.updatePackage(pkg.id, {
        isActive: nextActive,
      });
      setNotice(
        nextActive
          ? `Đã mở bán lại gói "${updated.name}".`
          : `Đã ngừng kinh doanh gói "${updated.name}". Các hợp đồng hội viên đã mua vẫn giữ nguyên hiệu lực.`,
      );
      await loadPackages();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Không thể cập nhật trạng thái gói tập.",
      );
    } finally {
      setBusy(false);
    }
  }

  const filtered = packages.filter((p) => {
    const active = p.isActive !== false;
    if (filter === "ACTIVE") return active;
    if (filter === "INACTIVE") return !active;
    return true;
  });

  return (
    <>
      <PageHeading
        section="Gói tập"
        title="Danh mục gói tập"
        description="Quản lý các gói tập tiêu chuẩn (1T, 3T, 6T+PT, 12T VIP), khung giờ ra vào và số buổi PT đi kèm."
        action={
          <button
            type="button"
            className="button primary"
            onClick={openCreate}
          >
            <Plus size={16} aria-hidden="true" /> Thêm gói tập mới
          </button>
        }
      />

      {notice && <Notice>{notice}</Notice>}
      {error && <Notice error>{error}</Notice>}

      {showForm && (
        <form
          className="panel"
          aria-labelledby="package-form-title"
          onSubmit={handleSubmit}
        >
          <h2 id="package-form-title">
            {editing
              ? `Chỉnh sửa gói tập · ${editing.code}`
              : "Thêm gói tập mới"}
          </h2>
          <div className="form-grid">
            <label className="field">
              Mã gói *
              <input
                value={form.code}
                disabled={!!editing || busy}
                required
                placeholder="VD: GYM01, GYM06_OFFPEAK"
                aria-invalid={!!fieldErrors.code}
                onChange={(e) =>
                  setForm({ ...form, code: e.target.value.toUpperCase() })
                }
              />
              <FieldError id="err-pkg-code" message={fieldErrors.code} />
            </label>

            <label className="field">
              Tên gói tập *
              <input
                value={form.name}
                disabled={busy}
                required
                placeholder="VD: Gym 6 tháng + PT"
                aria-invalid={!!fieldErrors.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <FieldError id="err-pkg-name" message={fieldErrors.name} />
            </label>

            <label className="field">
              Thời hạn (tháng) *
              <select
                aria-label="Thời hạn (tháng)"
                value={form.durationMonths}
                disabled={busy}
                onChange={(e) =>
                  setForm({
                    ...form,
                    durationMonths: Number(e.target.value) as DurationMonths,
                  })
                }
              >
                <option value={1}>1 tháng (1T)</option>
                <option value={3}>3 tháng (3T)</option>
                <option value={6}>6 tháng (6T — Hỗ trợ bảo lưu)</option>
                <option value={12}>12 tháng (12T VIP — Hỗ trợ bảo lưu)</option>
              </select>
              <FieldError
                id="err-pkg-duration"
                message={fieldErrors.durationMonths}
              />
            </label>

            <label className="field">
              Đơn giá (VNĐ) *
              <input
                type="number"
                min={1000}
                step={1000}
                value={form.price}
                disabled={busy}
                required
                aria-invalid={!!fieldErrors.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
              <FieldError id="err-pkg-price" message={fieldErrors.price} />
            </label>

            <label className="field">
              Khung giờ được phép Check-in *
              <select
                aria-label="Khung giờ được phép Check-in"
                value={form.accessWindow}
                disabled={busy}
                onChange={(e) =>
                  setForm({
                    ...form,
                    accessWindow: e.target.value as AccessWindow,
                  })
                }
              >
                <option value="REGULAR">
                  Toàn khung giờ (05:30–22:00)
                </option>
                <option value="OFF_PEAK">
                  Thấp điểm Off-peak (09:00–16:00)
                </option>
              </select>
              <FieldError
                id="err-pkg-window"
                message={fieldErrors.accessWindow}
              />
            </label>

            <label className="field">
              Số buổi PT đi kèm *
              <input
                type="number"
                min={0}
                step={1}
                value={form.ptSessionsIncluded}
                disabled={busy}
                required
                aria-invalid={!!fieldErrors.ptSessionsIncluded}
                onChange={(e) =>
                  setForm({ ...form, ptSessionsIncluded: e.target.value })
                }
              />
              <FieldError
                id="err-pkg-pt"
                message={fieldErrors.ptSessionsIncluded}
              />
            </label>
          </div>

          <div className="form-grid" style={{ marginTop: 12 }}>
            <label className="field">
              Quyền vào khu vực Gym
              <select
                value={form.grantsGymAccess ? "true" : "false"}
                disabled={busy}
                onChange={(e) =>
                  setForm({
                    ...form,
                    grantsGymAccess: e.target.value === "true",
                  })
                }
              >
                <option value="true">Có quyền check-in phòng tập</option>
                <option value="false">Không cấp quyền vào cửa</option>
              </select>
            </label>

            {editing && (
              <label className="field">
                Trạng thái kinh doanh
                <select
                  value={form.isActive ? "true" : "false"}
                  disabled={busy}
                  onChange={(e) =>
                    setForm({ ...form, isActive: e.target.value === "true" })
                  }
                >
                  <option value="true">Đang mở bán</option>
                  <option value="false">Ngừng kinh doanh</option>
                </select>
              </label>
            )}
          </div>

          {saveError && <Notice error>{saveError}</Notice>}

          <div className="actions">
            <button type="submit" className="button primary" disabled={busy}>
              {busy
                ? "Đang lưu…"
                : editing
                  ? "Lưu thay đổi"
                  : "Tạo gói tập"}
            </button>
            <button
              type="button"
              className="button outline"
              disabled={busy}
              onClick={() => {
                setShowForm(false);
                setEditing(null);
              }}
            >
              Hủy
            </button>
          </div>
        </form>
      )}

      <section className="panel" aria-label="Danh sách gói tập">
        <div
          className="actions"
          style={{ justifyContent: "space-between", marginBottom: 16 }}
        >
          <div className="actions" role="group" aria-label="Lọc trạng thái gói">
            <button
              type="button"
              className={`button ${filter === "ALL" ? "primary" : "outline"}`}
              onClick={() => setFilter("ALL")}
            >
              Tất cả ({packages.length})
            </button>
            <button
              type="button"
              className={`button ${filter === "ACTIVE" ? "primary" : "outline"}`}
              onClick={() => setFilter("ACTIVE")}
            >
              Đang mở bán ({packages.filter((p) => p.isActive !== false).length})
            </button>
            <button
              type="button"
              className={`button ${filter === "INACTIVE" ? "primary" : "outline"}`}
              onClick={() => setFilter("INACTIVE")}
            >
              Ngừng kinh doanh (
              {packages.filter((p) => p.isActive === false).length})
            </button>
          </div>
          <button
            type="button"
            className="button outline"
            disabled={loading || busy}
            onClick={() => void loadPackages()}
          >
            Làm mới
          </button>
        </div>

        {loading ? (
          <p role="status">Đang tải danh mục gói tập…</p>
        ) : !filtered.length ? (
          <Empty
            title="Không có gói tập nào"
            description="Nhấn 'Thêm gói tập mới' để khởi tạo gói tập cho phòng gym."
          />
        ) : (
          <div className="table-scroll">
            <table aria-label="Bảng danh mục gói tập">
              <thead>
                <tr>
                  <th>Mã gói</th>
                  <th>Tên gói tập</th>
                  <th>Thời hạn</th>
                  <th>Đơn giá</th>
                  <th>Khung giờ / Quyền lợi</th>
                  <th>Buổi PT</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((pkg) => {
                  const active = pkg.isActive !== false;
                  const windowKey: AccessWindow =
                    pkg.accessWindow || "REGULAR";
                  const ptCount = pkg.ptSessionsIncluded ?? 0;
                  return (
                    <tr key={pkg.id}>
                      <td>
                        <strong>{pkg.code}</strong>
                      </td>
                      <td>
                        <strong>{pkg.name}</strong>
                        {pkg.durationMonths >= 6 && (
                          <div style={{ fontSize: 12, opacity: 0.8 }}>
                            Hỗ trợ bảo lưu 7–30 ngày
                          </div>
                        )}
                      </td>
                      <td>{pkg.durationMonths} tháng</td>
                      <td>{money(pkg.price)}</td>
                      <td>
                        <div>{accessWindowLabel[windowKey]}</div>
                        <div style={{ fontSize: 12, opacity: 0.8 }}>
                          {pkg.grantsGymAccess
                            ? "Vào cửa khu vực Gym"
                            : "Không cấp quyền vào cửa"}
                        </div>
                      </td>
                      <td>
                        {ptCount > 0 ? (
                          <Badge tone="success">Kèm {ptCount} buổi PT</Badge>
                        ) : (
                          <span>Không kèm PT</span>
                        )}
                      </td>
                      <td>
                        <Badge tone={active ? "success" : "neutral"}>
                          {active ? "Đang mở bán" : "Ngừng kinh doanh"}
                        </Badge>
                      </td>
                      <td>
                        <div className="actions">
                          <button
                            type="button"
                            className="button outline"
                            disabled={busy}
                            onClick={() => openEdit(pkg)}
                          >
                            <Edit3 size={14} aria-hidden="true" /> Sửa
                          </button>
                          <button
                            type="button"
                            className="button outline"
                            disabled={busy}
                            onClick={() => void toggleActive(pkg)}
                          >
                            <Power size={14} aria-hidden="true" />{" "}
                            {active ? "Ngừng bán" : "Mở bán lại"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
