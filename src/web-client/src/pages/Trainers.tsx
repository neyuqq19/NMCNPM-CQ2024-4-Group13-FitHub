import { AvailableSlots } from "./TrainerSchedule";
import { useState, type FormEvent } from "react";
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
      <section className="panel">
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

  async function addCertification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const saved = await mutate(
      "certifications",
      "POST",
      {
        name: String(fields.get("name")).trim(),
        issuer: String(fields.get("issuer")).trim(),
        issuedAt: String(fields.get("issuedAt")),
        credentialUrl: String(fields.get("credentialUrl")).trim() || null,
        version: profile.version,
      },
      "Đã thêm chứng chỉ.",
    );
    if (saved) form.reset();
  }

  return (
    <>
      <section className="panel">
        {profile.avatarUrl && /^https?:\/\//i.test(profile.avatarUrl) && (
          <img
            className="trainer-avatar"
            src={profile.avatarUrl}
            alt={profile.displayName}
          />
        )}
        <h2>{owner ? profile.displayName : profile.trainerCode}</h2>
        <p>
          {[owner && profile.trainerCode, profile.email, profile.phone]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {owner ? (
          <form onSubmit={updateProfile} noValidate>
            <fieldset className="trainer-fields" disabled={disabled}>
              <label className="field">
                Tiểu sử chuyên môn
                <textarea rows={4} name="bio" defaultValue={initial.bio} />
              </label>
              <fieldset className="trainer-fields">
                <legend>Chuyên môn</legend>
                {specialties.map((s, i) => (
                  <div key={i} className="trainer-specialty">
                    <input
                      aria-label={`Chuyên môn ${i + 1}`}
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
                <label className="field">
                  Đường dẫn ảnh đại diện
                  <input
                    name="avatarUrl"
                    defaultValue={initial.avatarUrl || ""}
                  />
                </label>
              </div>
              <button className="button primary">Lưu hồ sơ</button>
            </fieldset>
          </form>
        ) : (
          <>
            <p className="trainer-bio">{profile.bio}</p>
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
      <section className="panel">
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
                    <td>{c.issuedAt.slice(0, 10)}</td>
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
                        <button
                          type="button"
                          className="button outline"
                          disabled={disabled}
                          aria-label={`Xóa chứng chỉ ${c.name}`}
                          onClick={() =>
                            void mutate(
                              `certifications/${encodeURIComponent(c.id)}`,
                              "DELETE",
                              { version: profile.version },
                              "Đã xóa chứng chỉ.",
                            )
                          }
                        >
                          Xóa
                        </button>
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
          <form onSubmit={addCertification}>
            <fieldset className="trainer-fields" disabled={disabled}>
              <legend>Thêm chứng chỉ</legend>
              <div className="form-grid">
                <label className="field">
                  Tên chứng chỉ
                  <input required name="name" />
                </label>
                <label className="field">
                  Tổ chức cấp
                  <input required name="issuer" />
                </label>
                <label className="field">
                  Ngày cấp
                  <input required type="date" name="issuedAt" />
                </label>
                <label className="field">
                  Mã hoặc đường dẫn minh chứng
                  <input name="credentialUrl" />
                </label>
              </div>
              <button className="button primary">Thêm chứng chỉ</button>
            </fieldset>
          </form>
        )}
      </section>
    </>
  );
}
