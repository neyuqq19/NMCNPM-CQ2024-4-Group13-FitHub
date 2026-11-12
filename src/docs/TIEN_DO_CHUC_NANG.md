# Bảng Theo Dõi Tiến Độ Chức Năng — Dự Án FitHub (Nhóm 13)
*(Bám sát tài liệu `rup_sad.docx v1.5` & `rup_ucspec-v2_final.docx v1.5` — Giai đoạn PA4 thực hiện **12/19 Use Cases ~ 63.2%**, PA5 thực hiện **7/19 Use Cases ~ 36.8%**)*

---

## 1. Tiến Độ 12 Use Cases Giai Đoạn PA4 (Mỗi UC = 1 Jira Task)

| Mã UC | Tên Use Case (`UCSpec v1.5`) | Mục `SAD v1.5` | Người phụ trách | File Đặc Tả Chi Tiết (`.md`) | Trạng thái |
| :---: | :--- | :---: | :--- | :--- | :---: |
| **UC01** | Đăng ký tài khoản & Xác thực OTP 6 chữ số (5p, cooldown 60s) | `4.1` | **Nguyễn Hữu Quyền** (`24120424`) | [UC01_QUYEN_DANG_KY_XAC_THUC_OTP.md](./jira-tasks/UC01_QUYEN_DANG_KY_XAC_THUC_OTP.md) | 🟢 **Đã xong** |
| **UC02** | Đăng nhập đa vai trò, Khóa tạm 15p & Single Active Session | `4.1` | **Nguyễn Hữu Quyền** (`24120424`) | [UC02_QUYEN_DANG_NHAP_PHAN_QUYEN.md](./jira-tasks/UC02_QUYEN_DANG_NHAP_PHAN_QUYEN.md) | 🟢 **Đã xong** |
| **UC03** | Check-in phòng tập bằng mã QR động TOTP 20s & Anti-passback 10p | `4.6` | **Nguyễn Hữu Quyền** (`24120424`) | [UC03_QUYEN_CHECKIN_QR_DONG.md](./jira-tasks/UC03_QUYEN_CHECKIN_QR_DONG.md) | 🟢 **Đã xong** |
| **UC04** | Quản lý hồ sơ hội viên (Khóa lạc quan `version` & Soft-Delete) | `4.3` | **Nguyễn Hữu Quyền** (`24120424`) | [UC04_QUYEN_QUAN_LY_HO_SO_HOI_VIEN.md](./jira-tasks/UC04_QUYEN_QUAN_LY_HO_SO_HOI_VIEN.md) | 🟢 **Đã xong** |
| **UC05** | Quản lý gói tập của hội viên (Đăng ký, Gia hạn `SCHEDULED`, Bảo lưu `FreezePeriod`) | `4.3` | **Trịnh Văn Hợp** (`24120318`) | [UC05_HOP_QUAN_LY_GOI_TAP.md](./jira-tasks/UC05_HOP_QUAN_LY_GOI_TAP.md) | 🟢 **Đã xong** |
| **UC06** | Quản lý hồ sơ chuyên môn PT (`TrainerProfile`, Chứng chỉ, Chính chủ PT) | `4.5` | **Võ Nhật Liệu** (`24120366`) | [UC06_LIEU_HO_SO_CHUYEN_MON_PT.md](./jira-tasks/UC06_LIEU_HO_SO_CHUYEN_MON_PT.md) | 🟢 Đã kiểm thử Web, API và Expo Web |
| **UC07** | Quản lý lịch làm việc của PT (Chia ca `60p + 15p đệm` & Báo bận trước 24h) | `4.5` | **Võ Nhật Liệu** (`24120366`) | [UC07_LIEU_LICH_LAM_VIEC_PT.md](./jira-tasks/UC07_LIEU_LICH_LAM_VIEC_PT.md) | 🟢 Đã kiểm thử Web, API và Expo Web |
| **UC08** | Đặt lịch hẹn PT 1-1 (Tạm giữ buổi PT, Hủy mốc 12h/6h đền bù +1 & `NO_SHOW`) | `4.5` | **Trương Minh Quang** (`24120415`) | [UC08_QUANG_DAT_LICH_HEN_PT.md](./jira-tasks/UC08_QUANG_DAT_LICH_HEN_PT.md) | 🟡 Cần làm (PA4) |
| **UC10** | Quản lý thiết bị phòng tập (Mã bất biến `EQ-<NHÓM>-<STT>`, QR tĩnh & Bảo trì) | `4.7` | **Trịnh Văn Hợp** (`24120318`) | [UC10_HOP_QUAN_LY_THIET_BI.md](./jira-tasks/UC10_HOP_QUAN_LY_THIET_BI.md) | 🟡 Cần làm (PA4) |
| **UC13** | Ghi nhật ký tập luyện (Hiệp `W/R/D/F`, Epley 1RM, Kỷ lục PR & Rest Timer) | `4.9` | **Nguyễn Trần Minh Trí** (`24120461`) | [UC13_TRI_NHAT_KY_TAP_LUYEN.md](./jira-tasks/UC13_TRI_NHAT_KY_TAP_LUYEN.md) | 🟡 Cần làm (PA4) |
| **UC15** | Thanh toán gói tập (Thu tại quầy, VNPay HMAC-SHA512 & Hóa đơn `SIMULATED`) | `4.4` | **Trương Minh Quang** (`24120415`) | [UC15_QUANG_THANH_TOAN_GOI_TAP.md](./jira-tasks/UC15_QUANG_THANH_TOAN_GOI_TAP.md) | 🟡 Cần làm (PA4) |
| **UC16** | Nhận thông báo nhắc lịch PT (`24h/2h`), nhắc hạn gói (`7d/3d`) & In-App Inbox | `4.11` | **Nguyễn Trần Minh Trí** (`24120461`) | [UC16_TRI_THONG_BAO_NHAC_LICH.md](./jira-tasks/UC16_TRI_THONG_BAO_NHAC_LICH.md) | 🟡 Cần làm (PA4) |

---

## 2. Danh Sách 7 Use Cases Để Dành Cho Giai Đoạn PA5 (`7/19 UCs ~ 36.8%`)

| Mã UC | Tên Use Case (`UCSpec v1.5`) | Mục `SAD v1.5` | Ghi chú lộ trình |
| :---: | :--- | :---: | :--- |
| **UC09** | Xác nhận hoàn thành buổi tập PT bằng mã QR động | `4.5` | Thực hiện ở **PA5** (sau khi hoàn tất đặt lịch PT `UC08`) |
| **UC11** | Báo cáo sự cố thiết bị bằng cách quét mã QR tĩnh trên máy | `4.7` | Thực hiện ở **PA5** (sau khi có danh mục thiết bị `UC10`) |
| **UC12** | Tra cứu thư viện bài tập chuẩn hóa (Video/GIF & Nhóm cơ) | `4.8` | Thực hiện ở **PA5** |
| **UC14** | Theo dõi chỉ số thể trạng (BMI/TDEE) & Bản đồ nhiệt phục hồi cơ bắp | `4.9` | Thực hiện ở **PA5** (mở rộng từ nhật ký tập luyện `UC13`) |
| **UC17** | Thống kê và báo cáo quản trị (Doanh thu, Hiệu suất PT, Churn/Retention, Giờ cao điểm) | `4.2` | Thực hiện ở **PA5** (tổng hợp dữ liệu từ tất cả phân hệ PA4) |
| **UC18** | Khởi tạo lộ trình tập luyện cá nhân hóa bằng AI | `4.10` | Thực hiện ở **PA5** |
| **UC19** | Tư vấn tập luyện và dinh dưỡng qua Trợ lý ảo AI (RAG) | `4.10` | Thực hiện ở **PA5** |
