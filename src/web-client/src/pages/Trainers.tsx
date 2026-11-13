import { AvailableSlots } from "./TrainerSchedule";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import type {
  CreateCertificationRequest,
  TrainerListResponse,
  TrainerProfileDto,
  UpdateTrainerProfileRequest,
} from "@fithub/contracts";
import { Badge, Notice, PageHeading } from "../components";
import { useResource } from "../hooks/useResource";
import { ApiError, fetchFromApi } from "../services/api.service";

import {
  TrainerDateField,
  trainerDateLabel,
} from "../components/TrainerDateField";
import "./TrainerProfile.css";

const section = "Huấn luyện viên";
const base = "/api/trainers";

function Specialties({ values }: { values: string[] }) {
  return (
    <div className="trainer-tags">
      {values.map((value, i) => (
        <span className="badge" key={i}>
          {value}
        </span>
      ))}
    </div>
  );
}

export function TrainerList() {
  const [query, setQuery] = useState("");
  const { data, error, loading, reload } = useResource(query, () =>
    fetchFromApi<TrainerListResponse>(base + (query ? "?" + query : "")),
  );

  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    for (const key of ["q", "specialty"]) {
      const value = String(fields.get(key) || "").trim();
      if (value) params.set(key, value);
    }
    setQuery(params.toString());
  }

  return (
    <>
      <PageHeading section={section} title={section} />
      <section className="panel trainer-profile">
        <form className="search-bar" onSubmit={filter}>
          <label className="field">
            Tên huấn luyện viên
            <input name="q" type="search" />
          </label>
          <label className="field">
            Chuyên môn
            <input name="specialty" type="search" />
          </label>
          <button className="button primary">Tìm kiếm</button>
        </form>
        {loading && <p role="status">Đang tải danh sách…</p>}
        {error && (
          <Notice error>
            {error}{" "}
            <button className="button outline" onClick={reload}>
              Thử lại
            </button>
          </Notice>
        )}
        {data &&
          (data.items.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Huấn luyện viên</th>
                    <th>Liên hệ</th>
                    <th>Chuyên môn</th>
                    <th>Kinh nghiệm</th>
                    <th>Chứng chỉ</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <Link
                          className="table-link"
                          to={`/trainers/${encodeURIComponent(t.id)}`}
                        >
                          {t.displayName}
                        </Link>
                        <br />
                        {t.trainerCode}
                      </td>
                      <td>
                        {t.email}
                        <br />
                        {t.phone}
                      </td>
                      <td>
                        <Specialties values={t.specialties} />
                      </td>
                      <td>{t.experienceYears} năm</td>
                      <td>{t.certificationCount}</td>
                      <td>
                        <Badge
                          tone={
                            t.accountStatus === "ACTIVE" ? "success" : "neutral"
                          }
                        >
                          {t.accountStatus}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>Không tìm thấy huấn luyện viên.</p>
          ))}
      </section>
    </>
  );
}

export function TrainerDetail({ owner = false }: { owner?: boolean }) {
  const { id } = useParams();
  const path = owner ? "me" : encodeURIComponent(id || "");
  const { data, error, loading, reload } = useResource(path, () =>
    fetchFromApi<TrainerProfileDto>(`${base}/${path}`),
  );
  return (
    <>
      <PageHeading
        section={section}
        title={
          owner
            ? "Hồ sơ chuyên môn"
            : data?.displayName || "Chi tiết huấn luyện viên"
        }
        back={owner ? undefined : "/trainers"}
        action={
          owner ? (
            <Link className="button outline" to="/trainers">
              Danh sách huấn luyện viên
            </Link>
          ) : undefined
        }
      />
      {loading && <p role="status">Đang tải hồ sơ…</p>}
      {error && (
        <Notice error>
          {error}{" "}
          <button className="button outline" onClick={reload}>
            Thử lại
          </button>
        </Notice>
      )}
      {data && (
        <TrainerProfileForm
          key={data.id}
          initial={data}
          owner={owner}
          reload={reload}
        />
      )}
      {data && <AvailableSlots trainerId={data.id} />}
    </>
  );
}

function TrainerAvatar({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false);
  let valid = false;
  try {
    valid = ["http:", "https:"].includes(new URL(url).protocol);
  } catch {
    // Show initials while the URL is empty or incomplete.
  }
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0])
    .join("");
  return (
    <div className="trainer-avatar-preview">
      {valid && !failed ? (
        <img
          className="trainer-avatar"
          src={url}
          alt={`Ảnh đại diện của ${name}`}
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className="trainer-avatar trainer-initials"
          aria-label={`Ảnh mặc định của ${name}`}
          role="img"
        >
          {initials}
        </span>
      )}
      {url && (!valid || failed) && (
        <span className="field-error" role="status">
          {failed
            ? "Không tải được ảnh. Vui lòng kiểm tra đường dẫn."
            : "Đường dẫn ảnh phải dùng HTTP hoặc HTTPS."}
        </span>
      )}
    </div>
  );
}

function TrainerProfileForm({
  initial,
  owner,
  reload,
}: {
  initial: TrainerProfileDto;
  owner: boolean;
  reload: () => void;
}) {
  const [profile, setProfile] = useState(initial);
  const [specialties, setSpecialties] = useState(initial.specialties);
  const [avatar, setAvatar] = useState(initial.avatarUrl || "");
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = profile.certifications.find((cert) => cert.id === editingId);
  const [issuedAt, setIssuedAt] = useState("");
  const certNameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editingId) certNameInput.current?.focus();
  }, [editingId]);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const disabled = busy || conflict;

  async function mutate(
    path: string,
    method: string,
    body:
      | UpdateTrainerProfileRequest
      | CreateCertificationRequest
      | { version: number },
    success: string,
  ) {
    if (disabled) return false;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const next = await fetchFromApi<TrainerProfileDto>(`${base}/me/${path}`, {
        method,
        body: JSON.stringify(body),
      });
      setProfile(next);
      setNotice(success);
      return true;
    } catch (e) {
      if (e instanceof ApiError) {
        setConflict(e.body.code === "VERSION_CONFLICT");
        setError(
          [e.message, ...Object.values(e.body.fieldErrors || {})].join(" "),
        );
      } else setError("Không thể lưu thay đổi.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const years = String(fields.get("experienceYears") || "").trim();
    if (!years) {
      setError("Vui lòng nhập số năm kinh nghiệm.");
      setNotice("");
      return;
    }
    void mutate(
      "profile",
      "PUT",
      {
        bio: String(fields.get("bio")).trim(),
        specialties: specialties.map((s) => s.trim()).filter(Boolean),
        experienceYears: Number(years),
        workStatus:
          fields.get("workStatus") === "ON_LEAVE" ? "ON_LEAVE" : "ACTIVE",
        avatarUrl: String(fields.get("avatarUrl")).trim() || null,
        version: profile.version,
      },
      "Đã lưu hồ sơ chuyên môn.",
    );
  }

  async function saveCertification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const saved = await mutate(
      editing
        ? `certifications/${encodeURIComponent(editing.id)}`
        : "certifications",
      editing ? "PATCH" : "POST",
      {
        name: String(fields.get("name")).trim(),
        issuer: String(fields.get("issuer")).trim(),
        issuedAt,
        credentialUrl: String(fields.get("credentialUrl")).trim() || null,
        version: profile.version,
      },
      editing ? "Đã cập nhật chứng chỉ." : "Đã thêm chứng chỉ.",
    );
    if (saved) {
      form.reset();
      setEditingId(null);
      setIssuedAt("");
    }
  }

  return (
    <>
      <section className="panel trainer-profile">
        <header className="trainer-identity">
          {!owner && (
            <TrainerAvatar
              url={profile.avatarUrl || ""}
              name={profile.displayName}
            />
          )}
          <div>
            <h2>{owner ? profile.displayName : profile.trainerCode}</h2>
            <p>
              {[owner && profile.trainerCode, profile.email, profile.phone]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </header>
        {owner ? (
          <form onSubmit={updateProfile} noValidate>
            <fieldset className="trainer-fields" disabled={disabled}>
              <label className="field">
                Giới thiệu bản thân
                <textarea
                  rows={4}
                  name="bio"
                  aria-describedby="trainer-bio-help"
                  defaultValue={initial.bio}
                />
              </label>
              <p id="trainer-bio-help" className="trainer-hint">
                Ví dụ: Tôi có 5 năm đồng hành cùng hội viên mới bắt đầu tập
                luyện.
              </p>
              <fieldset className="trainer-fields">
                <legend>Lĩnh vực chuyên môn</legend>
                <p className="trainer-hint">
                  Mỗi dòng một lĩnh vực, ví dụ Yoga hoặc Phục hồi chấn thương.
                </p>
                {specialties.map((s, i) => (
                  <div key={i} className="trainer-specialty">
                    <input
                      aria-label={`Chuyên môn ${i + 1}`}
                      placeholder="Ví dụ: Yoga"
                      value={s}
                      onChange={(e) =>
                        setSpecialties(
                          specialties.map((v, j) =>
                            j === i ? e.target.value : v,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="button outline"
                      aria-label={`Xóa chuyên môn ${i + 1}`}
                      onClick={() =>
                        setSpecialties(specialties.filter((_, j) => i !== j))
                      }
                    >
                      Xóa
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="button outline"
                  disabled={specialties.length >= 10}
                  onClick={() => setSpecialties([...specialties, ""])}
                >
                  Thêm chuyên môn
                </button>
              </fieldset>
              <div className="form-grid">
                <label className="field">
                  Trạng thái làm việc
                  <select name="workStatus" defaultValue={initial.workStatus}>
                    <option value="ACTIVE">Đang làm việc</option>
                    <option value="ON_LEAVE">Đang nghỉ phép</option>
                  </select>
                </label>
                <label className="field">
                  Số năm kinh nghiệm
                  <input
                    type="number"
                    name="experienceYears"
                    defaultValue={initial.experienceYears}
                  />
                </label>
              </div>
              <div className="trainer-photo-field">
                <TrainerAvatar
                  key={avatar.trim()}
                  url={avatar.trim()}
                  name={profile.displayName}
                />
                <label className="field">
                  Đường dẫn ảnh đại diện
                  <input
                    name="avatarUrl"
                    type="url"
                    placeholder="https://…"
                    value={avatar}
                    onChange={(event) => setAvatar(event.target.value)}
                  />
                </label>
              </div>
              <button className="button primary">Lưu hồ sơ</button>
            </fieldset>
          </form>
        ) : (
          <>
            <h3>Giới thiệu bản thân</h3>
            <p className="trainer-bio">{profile.bio}</p>
            <h3>Lĩnh vực chuyên môn</h3>
            <Specialties values={profile.specialties} />
            <p>{profile.experienceYears} năm kinh nghiệm</p>
            {profile.workStatus === "ON_LEAVE" && <p>PT đang nghỉ phép.</p>}
          </>
        )}
      </section>
      {notice && <Notice>{notice}</Notice>}
      {error && (
        <Notice error>
          {error}{" "}
          {conflict && (
            <button className="button outline" onClick={reload}>
              Tải lại hồ sơ
            </button>
          )}
        </Notice>
      )}
      <section className="panel trainer-profile">
        <h2>Chứng chỉ hành nghề</h2>
        {profile.certifications.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Tên chứng chỉ</th>
                  <th>Tổ chức cấp</th>
                  <th>Ngày cấp</th>
                  <th>Minh chứng</th>
                  {owner && <th>Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {profile.certifications.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.issuer}</td>
                    <td>{trainerDateLabel(c.issuedAt.slice(0, 10))}</td>
                    <td>
                      {c.credentialUrl &&
                      /^https?:\/\//i.test(c.credentialUrl) ? (
                        <a
                          href={c.credentialUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Xem minh chứng
                        </a>
                      ) : (
                        c.credentialUrl || "—"
                      )}
                    </td>
                    {owner && (
                      <td>
                        <div className="cert-actions">
                          <button
                            type="button"
                            className="button outline"
                            disabled={disabled}
                            aria-label={`Sửa chứng chỉ ${c.name}`}
                            onClick={() => {
                              if (editingId === c.id) {
                                certNameInput.current?.focus();
                                return;
                              }
                              setEditingId(c.id);
                              setIssuedAt(c.issuedAt.slice(0, 10));
                            }}
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            className="button outline"
                            disabled={disabled}
                            aria-label={`Xóa chứng chỉ ${c.name}`}
                            onClick={async () => {
                              const removed = await mutate(
                                `certifications/${encodeURIComponent(c.id)}`,
                                "DELETE",
                                { version: profile.version },
                                "Đã xóa chứng chỉ.",
                              );
                              if (removed && editingId === c.id) {
                                setEditingId(null);
                                setIssuedAt("");
                              }
                            }}
                          >
                            Xóa
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>Chưa có chứng chỉ.</p>
        )}
        {owner && (
          <form key={editingId ?? "new"} onSubmit={saveCertification}>
            <fieldset className="trainer-fields cert-form" disabled={disabled}>
              <legend>
                {editing ? `Sửa chứng chỉ · ${editing.name}` : "Thêm chứng chỉ"}
              </legend>
              <div className="form-grid">
                <label className="field">
                  Tên chứng chỉ
                  <input
                    required
                    name="name"
                    defaultValue={editing?.name}
                    ref={certNameInput}
                  />
                </label>
                <label className="field">
                  Tổ chức cấp
                  <input
                    required
                    name="issuer"
                    defaultValue={editing?.issuer}
                  />
                </label>
                <label className="field">
                  Ngày cấp
                  <TrainerDateField
                    required
                    name="issuedAt"
                    value={issuedAt}
                    onChange={setIssuedAt}
                  />
                </label>
                <label className="field">
                  Mã hoặc đường dẫn minh chứng
                  <input
                    name="credentialUrl"
                    defaultValue={editing?.credentialUrl ?? ""}
                  />
                </label>
              </div>
              <div className="cert-actions">
                <button className="button primary">
                  {editing ? "Lưu chứng chỉ" : "Thêm chứng chỉ"}
                </button>
                {editing && (
                  <button
                    type="button"
                    className="button outline"
                    onClick={() => {
                      setEditingId(null);
                      setIssuedAt("");
                    }}
                  >
                    Hủy sửa
                  </button>
                )}
              </div>
            </fieldset>
          </form>
        )}
      </section>
    </>
  );
}
