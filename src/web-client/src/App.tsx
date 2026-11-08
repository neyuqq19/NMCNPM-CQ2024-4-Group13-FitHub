import { useEffect, useState, type FormEvent } from "react";
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  LayoutGrid,
  Users,
  ReceiptText,
  Zap,
  Menu,
  X,
  Eye,
  EyeOff,
  ScanLine,
} from "lucide-react";
import { Brand, FieldError, Notice, PageHeading } from "./components";
import { Dashboard } from "./pages/Dashboard";

import { CheckInPage } from "./pages/CheckIn";
import { MemberList, MemberDetail, MemberForm } from "./pages/Members";
import {
  PackagePage,
  PaymentPage,
  SuccessPage,
  HistoryPage,
} from "./pages/Payments";

import type { CurrentUser } from "@fithub/contracts";
import { apiService, ApiError } from "./services/api.service";
function Login({ onLogin }: { onLogin: (user: CurrentUser) => void }) {
  const [email, setEmail] = useState("admin@fithub.vn");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      let deviceId = localStorage.getItem("fithub_device");
      if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem("fithub_device", deviceId);
      }
      const result = await apiService.login({
        identifier: email,
        password,
        platform: "WEB",
        deviceId,
        requestId: crypto.randomUUID(),
      });
      if (result.accessToken)
        sessionStorage.setItem("fithub_token", result.accessToken);
      if (result.user.role !== "ADMIN") {
        await apiService.logout();
        sessionStorage.removeItem("fithub_token");
        throw new Error("Chỉ Admin có quyền quản lý hội viên.");
      }
      onLogin(result.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể đăng nhập.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit} noValidate>
        <h1>FitHub</h1>
        <h2>Đăng nhập quản trị</h2>
        <p>Dành cho quản trị viên và nhân viên lễ tân.</p>
        <div className="login-fields">
          <label className="field">
            Email hoặc số điện thoại
            <input
              autoComplete="username"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
              }}
              aria-invalid={!!error}
              aria-describedby={error ? "login-error" : undefined}
            />
          </label>
          <label className="field">
            Mật khẩu
            <span className="password-control">
              <input
                type={visible ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                aria-invalid={!!error}
                aria-describedby={error ? "login-error" : "demo-help"}
              />
              <button
                type="button"
                className="icon-button"
                onClick={() => setVisible(!visible)}
                aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>
        </div>
        <FieldError id="login-error" message={error} />
        <button className="button primary" type="submit" disabled={busy}>
          {busy ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
        <p className="login-help">
          Không truy cập được? Liên hệ quản trị viên.
        </p>
        <details className="demo-help" id="demo-help">
          <summary>Tài khoản phát triển</summary>
          <p>
            Mật khẩu: <code>FitHubDemo!2026</code>
          </p>
          <p>Đăng nhập bằng tài khoản được cấp trên máy chủ FitHub.</p>
        </details>
      </form>
    </main>
  );
}
function Shell({
  onLogout,
  user,
}: {
  onLogout: () => void;
  user: CurrentUser;
}) {
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setMenu(false);
    window.scrollTo(0, 0);
    document
      .querySelector<HTMLHeadingElement>("h1")
      ?.focus({ preventScroll: true });
  }, [location.pathname]);
  useEffect(() => {
    function close(e: KeyboardEvent) {
      if (e.key === "Escape") setMenu(false);
    }
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Đến nội dung chính
      </a>
      <header className="topbar">
        <div className="topbar-brand">
          <button
            className="icon-button menu-button"
            aria-label={menu ? "Đóng menu" : "Mở menu"}
            aria-expanded={menu}
            aria-controls="sidebar"
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
          <Brand />
        </div>
        <div className="account">
          <span className="avatar" aria-hidden="true">
            HQ
          </span>
          <div>
            <strong>{user.displayName}</strong>
            <small>Quản trị hệ thống · Ca Sáng</small>
          </div>
        </div>
        <button className="button logout" onClick={onLogout}>
          Đăng xuất
        </button>
      </header>
      {menu && (
        <button
          className="menu-scrim"
          aria-label="Đóng menu điều hướng"
          onClick={() => setMenu(false)}
        />
      )}
      <aside id="sidebar" className={`sidebar ${menu ? "is-open" : ""}`}>
        <nav aria-label="Điều hướng quản trị">
          <p className="nav-label">ĐIỀU HƯỚNG QUẢN TRỊ</p>
          <NavLink to="/" end>
            <LayoutGrid size={18} />
            Tổng quan
          </NavLink>
          <p className="nav-label">NGHIỆP VỤ QUẦY LỄ TÂN</p>
          <NavLink to="/members">
            <Users size={18} />
            Hội viên
          </NavLink>
          <NavLink to="/check-in">
            <ScanLine size={18} />
            Check-in
          </NavLink>
          <NavLink to="/history">
            <ReceiptText size={18} />
            Giao dịch
          </NavLink>
        </nav>
      </aside>
      <main id="main-content" className="main-content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
function Home({ user }: { user: CurrentUser }) {
  return <Dashboard user={user} />;
}
function NotFound() {
  return (
    <>
      <PageHeading title="Không tìm thấy trang" />
      <Notice error>Đường dẫn không còn tồn tại.</Notice>
      <Link className="button outline" to="/">
        Về trang chủ
      </Link>
    </>
  );
}
export function App() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const navigate = useNavigate();
  function clearSession() {
    sessionStorage.removeItem("fithub_token");
    setUser(null);
    navigate("/login");
  }
  async function check() {
    setChecking(true);
    setSessionError("");
    try {
      if (sessionStorage.getItem("fithub_token")) {
        const current = await apiService.me();
        if (current.role !== "ADMIN") {
          clearSession();
        } else setUser(current);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) clearSession();
      else
        setSessionError(
          e instanceof Error ? e.message : "Không thể kiểm tra phiên.",
        );
    } finally {
      setChecking(false);
    }
  }
  useEffect(() => {
    void check();
  }, []);
  useEffect(() => {
    window.addEventListener("fithub:session-expired", clearSession);
    return () =>
      window.removeEventListener("fithub:session-expired", clearSession);
  }, []);
  function login(current: CurrentUser) {
    setUser(current);
    navigate("/members");
  }
  async function logout() {
    try {
      await apiService.logout();
      clearSession();
    } catch (e) {
      setSessionError(e instanceof Error ? e.message : "Không thể đăng xuất.");
    }
  }
  if (checking)
    return (
      <main className="login-page">
        <p role="status">Đang kiểm tra phiên…</p>
      </main>
    );
  if (sessionError)
    return (
      <main className="login-page">
        <section className="panel">
          <Notice error>{sessionError}</Notice>
          <button className="button primary" onClick={() => void check()}>
            Thử lại
          </button>
        </section>
      </main>
    );
  return (
    <>
      <Routes>
        <Route
          path="/login"
          element={
            user ? (
              <Navigate to="/members" replace />
            ) : (
              <Login onLogin={login} />
            )
          }
        />
        <Route
          element={
            user ? (
              <Shell onLogout={() => void logout()} user={user} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        >
          <Route index element={<Home user={user!} />} />
          <Route path="check-in" element={<CheckInPage />} />
          <Route path="members" element={<MemberList />} />
          <Route path="members/new" element={<MemberForm />} />
          <Route path="members/:id" element={<MemberDetail />} />
          <Route path="members/:id/edit" element={<MemberForm />} />
          <Route path="members/:id/package" element={<PackagePage />} />
          <Route path="members/:id/payment" element={<PackagePage />} />
          <Route path="payments/:paymentId" element={<PaymentPage />} />
          <Route path="payments/:paymentId/success" element={<SuccessPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  );
}
