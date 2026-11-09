import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Users,
  ScanLine,
  Clock3,
  Coins,
  Activity,
  Check,
  UserPlus,
  ArrowRight,
  ChartNoAxesColumn,
} from "lucide-react";
import type { CurrentUser, DashboardDto } from "@fithub/contracts";
import { Notice, PageHeading } from "../components";
import { fetchFromApi } from "../services/api.service";
import { date, money } from "../data";
import "./Dashboard.css";
function vietnamToday() {
  return new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
}
export function Dashboard({ user }: { user: CurrentUser }) {
  const today = vietnamToday();
  const [day, setDay] = useState(today);
  const [range, setRange] = useState<DashboardDto["range"]>("7d");
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<DashboardDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState(false);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    setData(null);
    setUpdated(false);
    fetchFromApi<DashboardDto>(
      `/api/dashboard?date=${encodeURIComponent(day)}&range=${range}`,
    )
      .then((value) => {
        if (live) {
          setData(value);
          setUpdated(revision > 0);
        }
      })
      .catch((e) => {
        if (live)
          setError(
            e instanceof Error ? e.message : "Không tải được tổng quan.",
          );
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [day, range, revision]);
  useEffect(() => {
    if (updated) {
      const timer = setTimeout(() => setUpdated(false), 3500);
      return () => clearTimeout(timer);
    }
  }, [updated]);
  const max = Math.max(1, ...(data?.checkInSeries.map((d) => d.count) ?? []));
  const label = day === today ? "hôm nay" : date(day);
  return (
    <div className="dashboard-page">
      <PageHeading
        section="Tổng quan"
        title={`Xin chào, ${user.displayName} 👋`}
        description="Tổng quan hoạt động phòng gym. Quản lý hội viên, check-in và doanh thu nhanh chóng."
        action={
          <div className="dashboard-controls">
            <label>
              Ngày thống kê
              <input
                aria-label="Ngày thống kê"
                type="date"
                value={day}
                max={today}
                onChange={(e) => {
                  if (e.target.value) {
                    setDay(e.target.value);
                    setRevision(0);
                  }
                }}
              />
            </label>
            <button
              className="button outline"
              disabled={loading}
              onClick={() => setRevision((v) => v + 1)}
            >
              Làm mới
            </button>
          </div>
        }
      />
      {updated && (
        <div className="dashboard-toast" role="status">
          <Check size={18} /> Đã cập nhật dữ liệu
        </div>
      )}
      <div className="dashboard-range" role="group" aria-label="Khoảng biểu đồ">
        {(["7d", "30d", "month"] as const).map((value, i) => (
          <button
            key={value}
            type="button"
            aria-pressed={range === value}
            onClick={() => {
              setRange(value);
              setRevision(0);
            }}
          >
            {["7 ngày", "30 ngày", "Tháng này"][i]}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="panel dashboard-loading" role="status">
          Đang tải tổng quan…
        </div>
      ) : error || !data ? (
        <div>
          <Notice error>{error || "Không tải được tổng quan."}</Notice>
          <button
            className="button outline"
            onClick={() => setRevision((v) => v + 1)}
          >
            Thử lại
          </button>
        </div>
      ) : (
        <>
          <div className="dashboard-stats">
            {[
              {
                title: "Hội viên đã xác minh",
                value: data.activeMembers,
                note: "Đang hoạt động · Hiện tại",
                icon: Users,
              },
              {
                title: "Lượt check-in",
                value: `${data.checkInsToday} lượt`,
                note: `Trong ngày ${date(day)}`,
                icon: ScanLine,
              },
              {
                title: "Hồ sơ chờ xác minh",
                value: data.pendingMembers,
                note: "Hiện tại",
                icon: Clock3,
              },
              {
                title: "Doanh thu",
                value: money(data.revenueToday),
                note: `Trong ngày ${date(day)}`,
                icon: Coins,
              },
            ].map(({ title, value, note, icon: Icon }, i) => (
              <section className={`dashboard-stat tone-${i % 2}`} key={title}>
                <span className="dashboard-icon">
                  <Icon size={25} />
                </span>
                <div>
                  <h2>{title}</h2>
                  <strong>{value}</strong>
                  <small>{note}</small>
                </div>
              </section>
            ))}
          </div>
          <div className="dashboard-middle">
            <section className="panel dashboard-chart">
              <h2>
                <ChartNoAxesColumn size={23} /> Lượt check-in{" "}
                {range === "month"
                  ? "trong tháng"
                  : range === "7d"
                    ? "7 ngày"
                    : "30 ngày"}
              </h2>
              <p className="dashboard-muted">
                Đến {date(day)} ·{" "}
                {data.checkInSeries.reduce((sum, d) => sum + d.count, 0)} lượt
              </p>
              {!data.checkInSeries.some((d) => d.count) && (
                <p className="dashboard-muted">
                  Chưa có lượt check-in trong khoảng này.
                </p>
              )}
              <div className="dashboard-chart-scroll">
                <div
                  className="dashboard-bars"
                  style={{
                    minWidth:
                      data.checkInSeries.length > 10
                        ? data.checkInSeries.length * 38
                        : undefined,
                  }}
                  role="group"
                  aria-label="Check-in theo ngày"
                >
                  {data.checkInSeries.map((point, i) => (
                    <div className="dashboard-column" key={point.date}>
                      <button
                        className={`dashboard-bar ${i === data.checkInSeries.length - 1 ? "last" : ""}`}
                        style={{
                          height: `${Math.max(2, (point.count / max) * 100)}%`,
                        }}
                        aria-label={`${date(point.date)}: ${point.count} lượt check-in`}
                        onClick={(e) => e.currentTarget.focus()}
                      >
                        <span className="dashboard-tooltip">
                          {date(point.date)}: {point.count} lượt
                        </span>
                        <span className="dashboard-bar-value">
                          {point.count}
                        </span>
                      </button>
                      <span className="dashboard-bar-label">
                        {point.date.slice(8)}/{point.date.slice(5, 7)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <details className="dashboard-data">
                <summary>Xem số liệu dạng bảng</summary>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Ngày</th>
                        <th>Lượt check-in</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.checkInSeries.map((p) => (
                        <tr key={p.date}>
                          <td>{date(p.date)}</td>
                          <td>{p.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>
            <section className="panel dashboard-activity">
              <h2>
                <Activity size={23} /> Hoạt động {label}
              </h2>
              {[
                {
                  icon: Check,
                  count: data.confirmedPaymentsToday,
                  title: "khoản thu đã xác nhận",
                  text: "Khoản thu được xác nhận trong ngày.",
                },
                {
                  icon: UserPlus,
                  count: data.newMembers,
                  title: "hội viên mới",
                  text: "Hồ sơ hội viên được thêm trong ngày.",
                },
                {
                  icon: ScanLine,
                  count: data.checkInsToday,
                  title: "lượt check-in",
                  text: "Lượt vào tập đã xác nhận tại quầy.",
                },
              ].map(({ icon: Icon, count, title, text }) => (
                <div className="dashboard-event" key={title}>
                  <span className="dashboard-icon">
                    <Icon size={22} />
                  </span>
                  <div>
                    <strong>
                      {count} {title}
                    </strong>
                    <p>{text}</p>
                  </div>
                </div>
              ))}
            </section>
          </div>
          <div className="dashboard-features">
            <section className="dashboard-feature">
              <Users size={34} />
              <h2>Quản lý hội viên</h2>
              <p>Tra cứu hồ sơ, đăng ký gói và xem lịch sử mua.</p>
              <Link className="button primary" to="/members">
                Mở danh sách hội viên <ArrowRight size={18} />
              </Link>
            </section>
            <section className="dashboard-feature purple">
              <Coins size={34} />
              <h2>Thu tiền & lịch sử</h2>
              <p>Đối chiếu khoản chờ, khoản đã thu và giao dịch đã hủy.</p>
              <Link className="button primary" to="/history">
                Xem giao dịch <ArrowRight size={18} />
              </Link>
            </section>
          </div>
          <section className="panel dashboard-payments">
            <h2>Khoản thu gần nhất · {date(day)}</h2>
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
            <small className="dashboard-muted">
              Không tính giao dịch TEST QR vào doanh thu.
            </small>
          </section>
        </>
      )}
    </div>
  );
}
