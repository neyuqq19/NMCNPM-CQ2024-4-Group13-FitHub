import { useEffect, useState } from "react";
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
  Menu,
  X,
  ScanLine,
  ChevronLeft,
  ChevronRight,
  Package,
  Dumbbell,
} from "lucide-react";
import { Brand, Notice, PageHeading } from "./components";
import { AdminLogin } from "./pages/AdminLogin";
import { Dashboard } from "./pages/Dashboard";

import { CheckInPage } from "./pages/CheckIn";
import { MemberList, MemberDetail, MemberForm } from "./pages/Members";
import { PackagesPage } from "./pages/Packages";
import { EquipmentsPage, EquipmentDetailPage } from "./pages/Equipments";
import {
  PackagePage,
  PaymentPage,
  SuccessPage,
  HistoryPage,
} from "./pages/Payments";

import type { CurrentUser } from "@fithub/contracts";
import { apiService, ApiError } from "./services/api.service";
function Shell({
  onLogout,
  user,
}: {
  onLogout: () => void;
  user: CurrentUser;
}) {
  const [menu, setMenu] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("fithub_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  function toggleSidebar() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("fithub_sidebar_collapsed", String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }

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
    <div className={`app-shell ${collapsed ? "is-collapsed" : ""}`}>
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
      <aside
        id="sidebar"
        className={`sidebar ${menu ? "is-open" : ""} ${collapsed ? "is-collapsed" : ""}`}
      >
        <div className="sidebar-brand">
          <Brand collapsed={collapsed} />
        </div>
        <nav aria-label="Điều hướng quản trị" className="sidebar-nav">
          {!collapsed && <p className="nav-label">ĐIỀU HƯỚNG QUẢN TRỊ</p>}
          <NavLink to="/" end title={collapsed ? "Tổng quan" : undefined}>
            <LayoutGrid size={22} />
            {!collapsed && <span>Tổng quan</span>}
          </NavLink>
          {!collapsed && <p className="nav-label">NGHIỆP VỤ QUẦY LỄ TÂN</p>}
          <NavLink to="/members" title={collapsed ? "Hội viên" : undefined}>
            <Users size={22} />
            {!collapsed && <span>Hội viên</span>}
          </NavLink>
          <NavLink to="/packages" title={collapsed ? "Gói tập" : undefined}>
            <Package size={22} />
            {!collapsed && <span>Gói tập</span>}
          </NavLink>
          <NavLink to="/equipments" title={collapsed ? "Thiết bị" : undefined}>
            <Dumbbell size={22} />
            {!collapsed && <span>Thiết bị</span>}
          </NavLink>
          <NavLink to="/check-in" title={collapsed ? "Check-in" : undefined}>
            <ScanLine size={22} />
            {!collapsed && <span>Check-in</span>}
          </NavLink>
          <NavLink to="/history" title={collapsed ? "Giao dịch" : undefined}>
            <ReceiptText size={22} />
            {!collapsed && <span>Giao dịch</span>}
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-collapse-button"
            onClick={toggleSidebar}
            title={
              collapsed
                ? "Mở rộng thanh điều hướng"
                : "Thu gọn thanh điều hướng"
            }
            aria-label={
              collapsed
                ? "Mở rộng thanh điều hướng"
                : "Thu gọn thanh điều hướng"
            }
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            {!collapsed && <span>Thu gọn</span>}
          </button>
        </div>
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
              <AdminLogin onLogin={login} />
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
          <Route path="packages" element={<PackagesPage />} />
          <Route path="equipments" element={<EquipmentsPage />} />
          <Route path="equipments/:id" element={<EquipmentDetailPage />} />
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
