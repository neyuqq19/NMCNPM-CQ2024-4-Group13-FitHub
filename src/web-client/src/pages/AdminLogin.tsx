import { useRef, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  UserRound,
} from "lucide-react";
import type { CurrentUser } from "@fithub/contracts";
import { Brand, FieldError } from "../components";
import { apiService } from "../services/api.service";
import "./AdminLogin.css";

export function AdminLogin({
  onLogin,
}: {
  onLogin: (user: CurrentUser) => void;
}) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<{
    identifier?: string;
    password?: string;
  }>({});
  const lock = useRef(false);
  const identifierRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    setError("");
    const invalid = {
      identifier: identifier.trim()
        ? undefined
        : "Nhập email hoặc số điện thoại.",
      password: password ? undefined : "Nhập mật khẩu.",
    };
    setFields(invalid);
    if (invalid.identifier || invalid.password) {
      (invalid.identifier ? identifierRef : passwordRef).current?.focus();
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      let deviceId = localStorage.getItem("fithub_device");
      if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem("fithub_device", deviceId);
      }
      const result = await apiService.login({
        identifier: identifier.trim(),
        password,
        platform: "WEB",
        deviceId,
        requestId: crypto.randomUUID(),
      });
      if (result.accessToken)
        sessionStorage.setItem("fithub_token", result.accessToken);
      if (result.user.role !== "ADMIN") {
        try {
          await apiService.logout();
        } finally {
          sessionStorage.removeItem("fithub_token");
        }
        throw new Error("Chỉ Admin có quyền quản lý hội viên.");
      }
      onLogin(result.user);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Không thể đăng nhập. Vui lòng thử lại.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="admin-login-page">
      <div className="admin-login-layout">
        <aside className="admin-login-hero" aria-label="Giới thiệu FitHub">
          <img
            className="admin-login-photo"
            src="/login-gym.jpg"
            alt=""
            fetchPriority="high"
          />
          <div className="admin-login-hero-shade" />
          <div className="admin-login-hero-brand">
            <Brand variant="inverse" />
          </div>
          <div className="admin-login-story">
            <span className="admin-login-story-line" aria-hidden="true" />
            <h2>
              Vận hành phòng tập <br />
              dễ dàng hơn.
            </h2>
            <p>Quản lý hội viên, gói tập và check-in tại quầy.</p>
          </div>
        </aside>
        <section
          className="admin-login-form-panel"
          aria-labelledby="admin-login-title"
        >
          <div className="admin-login-mobile-brand">
            <Brand />
          </div>
          <form
            className="admin-login-form"
            onSubmit={submit}
            noValidate
            aria-busy={busy}
          >
            <header className="admin-login-heading">
              <p className="admin-login-eyebrow">FITHUB ADMIN</p>
              <h1 id="admin-login-title">Đăng nhập quản trị</h1>
              <p>Đăng nhập để bắt đầu ca làm việc.</p>
            </header>
            <div className="admin-login-fields">
              <div className="admin-login-field">
                <label htmlFor="admin-identifier">
                  Email hoặc số điện thoại
                </label>
                <div className="admin-login-input-wrap">
                  <UserRound size={19} aria-hidden="true" />
                  <input
                    ref={identifierRef}
                    id="admin-identifier"
                    name="username"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="Nhập email hoặc số điện thoại"
                    value={identifier}
                    disabled={busy}
                    aria-invalid={!!fields.identifier}
                    aria-describedby={
                      fields.identifier ? "admin-identifier-error" : undefined
                    }
                    onChange={(e) => {
                      setIdentifier(e.target.value);
                      setFields((f) => ({ ...f, identifier: undefined }));
                      setError("");
                    }}
                  />
                </div>
                <FieldError
                  id="admin-identifier-error"
                  message={fields.identifier}
                />
              </div>
              <div className="admin-login-field">
                <label htmlFor="admin-password">Mật khẩu</label>
                <div className="admin-login-input-wrap">
                  <LockKeyhole size={19} aria-hidden="true" />
                  <input
                    ref={passwordRef}
                    id="admin-password"
                    name="password"
                    type={visible ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Nhập mật khẩu"
                    value={password}
                    disabled={busy}
                    aria-invalid={!!fields.password}
                    aria-describedby={
                      fields.password ? "admin-password-error" : undefined
                    }
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setFields((f) => ({ ...f, password: undefined }));
                      setError("");
                    }}
                  />
                  <button
                    type="button"
                    className="admin-login-eye"
                    aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    aria-pressed={visible}
                    disabled={busy}
                    onClick={() => setVisible((v) => !v)}
                  >
                    {visible ? (
                      <EyeOff size={19} aria-hidden="true" />
                    ) : (
                      <Eye size={19} aria-hidden="true" />
                    )}
                  </button>
                </div>
                <FieldError
                  id="admin-password-error"
                  message={fields.password}
                />
              </div>
            </div>
            {error && (
              <div className="admin-login-alert" role="alert" id="login-error">
                <AlertCircle size={18} aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}
            <button
              className="admin-login-submit"
              type="submit"
              disabled={busy}
            >
              {busy ? (
                <>
                  <LoaderCircle
                    className="admin-login-spinner"
                    size={19}
                    aria-hidden="true"
                  />
                  Đang đăng nhập…
                </>
              ) : (
                <>
                  Đăng nhập
                  <ArrowRight size={19} aria-hidden="true" />
                </>
              )}
            </button>
            <div className="admin-login-support">
              <p>Không truy cập được?</p>
              <p>Liên hệ quản trị viên để được hỗ trợ.</p>
            </div>
          </form>
          <p className="admin-login-footnote">
            Dành cho tài khoản quản trị được cấp.
          </p>
        </section>
      </div>
    </main>
  );
}
