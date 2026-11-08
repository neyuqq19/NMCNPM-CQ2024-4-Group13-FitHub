import { Link } from "react-router-dom";
import type { CurrentUser, DashboardDto } from "@fithub/contracts";
import { Notice, PageHeading } from "../components";
import { fetchFromApi } from "../services/api.service";
import { useResource } from "../hooks/useResource";
import { date, money } from "../data";
export function Dashboard({ user }: { user: CurrentUser }) {
  const { data, error, loading, reload } = useResource("dashboard", () =>
    fetchFromApi<DashboardDto>("/api/dashboard"),
  );
  return (
    <>
      <PageHeading
        section="Tổng quan"
        title={`Xin chào, ${user.displayName}`}
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
      {loading ? (
        <p role="status">Đang tải tổng quan…</p>
      ) : error || !data ? (
        <Notice error>{error || "Không tải được tổng quan."}</Notice>
      ) : (
        <>
          <div className="stats-grid">
            {[
              ["HỘI VIÊN ĐÃ XÁC MINH", data.activeMembers],
              ["LƯỢT CHECK-IN HÔM NAY", `${data.checkInsToday} lượt`],
              ["HỒ SƠ CHỜ XÁC MINH", data.pendingMembers],
              ["DOANH THU HÔM NAY", money(data.revenueToday)],
            ].map(([label, value]) => (
              <div className="stat" key={label}>
                <small>{label}</small>
                <div>
                  <strong>{value}</strong>
                </div>
              </div>
            ))}
          </div>
          <p>
            Ngày làm việc: {date(data.day)} · {data.confirmedPaymentsToday}{" "}
            khoản thu đã xác nhận. Không tính giao dịch TEST QR vào doanh thu.
          </p>
          <section className="panel activity">
            <h2>Hoạt động thu tiền hôm nay</h2>
            {data.recentPayments.length ? (
              data.recentPayments.map((p) => (
                <div className="activity-row" key={p.id}>
                  <Link to={`/payments/${p.id}/success`}>
                    {p.code} · {p.member.displayName}
                  </Link>
                  <span>{p.membership.packageName}</span>
                  <strong>{money(p.amount)}</strong>
                </div>
              ))
            ) : (
              <p>Chưa có khoản thu đã xác nhận trong ngày.</p>
            )}
          </section>
        </>
      )}
      <div className="feature-grid">
        <section className="feature-card">
          <h2>Quản lý hội viên</h2>
          <p>Tra cứu hồ sơ, đăng ký gói và xem lịch sử mua.</p>
          <Link className="button primary" to="/members">
            Mở danh sách hội viên
          </Link>
        </section>
        <section className="feature-card">
          <h2>Thu tiền và lịch sử</h2>
          <p>Đối chiếu khoản chờ, khoản đã thu và giao dịch đã hủy.</p>
          <Link className="button primary" to="/history">
            Xem giao dịch
          </Link>
        </section>
      </div>
    </>
  );
}
