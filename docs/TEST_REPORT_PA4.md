# Báo cáo kiểm thử PA4 — FitHub (Nhóm 13)

- **Người lập:** Nguyễn Trần Minh Trí (`24120461`) — Jira `SCRUM-108`
- **Ngày chạy:** 12/11/2026
- **Phạm vi:** kết quả chạy thật của phần mã đã có trên `main` cộng với hai nhánh của người lập (UC13, UC16). Use Case nào chưa có mã trong repo thì ghi rõ là **chưa kiểm thử**, không ghi PASS.

---

## 1. Cây mã nguồn đã kiểm thử

Mọi số liệu dưới đây lấy từ một cây mã nguồn tích hợp tạm, gộp ba thành phần:

| Thành phần | Commit |
| :--- | :--- |
| `origin/main` | `a63dbdc` |
| `origin/feature/uc13-tri-workout-log` (PR #8, chưa merge) | `5092d00` |
| `feature/uc16-tri-notifications` (chưa có PR) | `d7b7b57` |

Khi gộp, UC13 và UC16 xung đột ở 9 file dùng chung (`schema.prisma`, `seed.ts`, `app.module.ts`, `App.tsx`, `HomePanel.tsx`, `api.ts`, `types.ts`, `shared/src/index.ts`, `test-database.mjs`). Toàn bộ là thêm song song, đã giải quyết bằng cách giữ cả hai phía; sau khi gộp `typecheck` và `build` vẫn sạch.

## 2. Môi trường kiểm thử

| Mục | Giá trị |
| :--- | :--- |
| Hệ điều hành | Windows 11 Home |
| Node.js | v24.15.0 (hướng dẫn nhóm ghi `22.x`, repo yêu cầu `>=22.13`) |
| Backend | NestJS 11, Prisma 6.19.3 |
| Cơ sở dữ liệu | PostgreSQL cục bộ `fithub_test` tại `127.0.0.1:55432` (không đụng dữ liệu Supabase) |
| Trình duyệt E2E | Microsoft Edge (Playwright), viewport mobile `390x844` |

## 3. Kết quả chạy lệnh

| Lệnh (chạy tại `src/`) | Kết quả | Ghi chú |
| :--- | :---: | :--- |
| `npm run typecheck` | **PASS** | 4 workspace, không lỗi |
| `npm run build` | **PASS** | contracts, api, web |
| `npm run db:test` (tương đương `npm test`) | **PASS 89/89** | Node Test Runner + Supertest, 9 file test, 17 giây |
| `npm run test:unit -w @fithub/mobile` | **PASS 5/5** | `api-host.test.ts` |
| `npm run test:mobile` | **10 PASS / 2 FAIL** | 2 lỗi nằm sẵn trên `main`, xem mục 5 |
| `npm run test:e2e` (web) | **29 PASS / 2 FAIL** | 2 lỗi nằm sẵn trên `main`, xem mục 5 |

Phân bố test tự động theo file (backend `db:test`): `database`, `members`, `auth-registration`, `check-ins`, `sales` (UC01–UC04 và hạ tầng); `workouts-rules` + `workouts` (UC13); `notifications-rules` + `notifications` (UC16).

## 4. Kết quả theo từng Use Case

Danh sách 12 Use Case của PA4 lấy từ `src/docs/TIEN_DO_CHUC_NANG.md`. Jira ghi "13 UCs" nhưng tài liệu chỉ liệt kê 12; **cần Quyền xác nhận UC thứ 13**.

| UC | Tên | Trạng thái mã | Kết quả kiểm thử | Bằng chứng |
| :---: | :--- | :--- | :---: | :--- |
| UC01 | Đăng ký & xác thực OTP | Có trên `main` | **PASS** backend; **FAIL** 2 ca E2E mobile (lỗi sẵn có) | `auth-registration.test.ts`, `auth.spec.ts` |
| UC02 | Đăng nhập, khóa tạm, phiên duy nhất | Có trên `main` | **PASS** backend; **FAIL** 2 ca E2E mobile (lỗi sẵn có) | `auth-registration.test.ts`, `login.spec.ts`, `auth.spec.ts` |
| UC03 | Check-in QR động | Có trên `main` | **PASS** | `check-ins.test.ts`, `check-in.spec.ts` (mobile + web) |
| UC04 | Quản lý hồ sơ hội viên | Có trên `main` | **PASS** | `members.test.ts`, `ui.spec.ts` (7 ca) |
| UC05 | Quản lý gói tập | PR #7 chưa merge | **Chưa kiểm thử** | Không nằm trong cây đã chạy |
| UC06 | Hồ sơ chuyên môn PT | PR #5 chưa merge | **Chưa kiểm thử** | Không nằm trong cây đã chạy |
| UC07 | Lịch làm việc PT | PR #6 chưa merge | **Chưa kiểm thử** | Không nằm trong cây đã chạy |
| UC08 | Đặt lịch hẹn PT | Chưa có nhánh | **Chưa kiểm thử** | Chưa có mã |
| UC10 | Quản lý thiết bị | Chưa có nhánh | **Chưa kiểm thử** | Chưa có mã |
| UC13 | Ghi nhật ký tập luyện | PR #8 chưa merge | **PASS** (trên cây tích hợp) | 9 test backend + `workout-log.spec.ts` |
| UC15 | Thanh toán gói tập | Chưa có nhánh | **Chưa kiểm thử** | Chưa có nhánh; chưa có mã và test riêng cho VNPay, hóa đơn |
| UC16 | Nhận thông báo nhắc lịch | Nhánh `feature/uc16-tri-notifications`, chưa có PR | **PASS** (trên cây tích hợp) | 15 test backend + `notifications.spec.ts` |

Tổng hợp: **PASS 6** (UC03, UC04, UC13, UC16 hoàn toàn; UC01, UC02 chỉ phần backend, kèm lỗi E2E sẵn có), **chưa kiểm thử 6** (UC05, 06, 07, 08, 10, 15).

### 4.1. Ca kiểm thử UC13 — Ghi nhật ký tập luyện

| Mã ca | Nội dung | Kỹ thuật | Kết quả |
| :--- | :--- | :--- | :---: |
| UC13-BR02/BR03 | Epley 1RM chỉ tính cho hiệp `R` có tạ ngoài; `reps = 1` giữ nguyên tạ | Giá trị biên | PASS |
| UC13-BR01 | `totalVolume` bằng tổng `reps × weightKg` | Hộp trắng | PASS |
| UC13-BR04 | Buổi đầu là baseline, chỉ 1RM lớn hơn hẳn mới là PR | Giá trị biên | PASS |
| UC13 (streak) | Chuỗi ngày tập tính đến hôm nay hoặc hôm qua | Hộp trắng | PASS |
| UC13 (validate) | Từ chối `setType` sai, `reps` ngoài 1–500, `weightKg` ngoài 0–1000, buổi rỗng (`EMPTY_WORKOUT_SESSION`) | Lớp tương đương | PASS |
| UC13-01 | Kịch bản nghiệm thu: Back Squat 1100 kg, 1RM 116.67 baseline, rồi 122.5 là PR | Kịch bản | PASS |
| UC13-02 | Hiệp W/D/F và bài không tạ không tạo kỷ lục; buổi rỗng bị từ chối | Lớp tương đương | PASS |
| UC13-03 | Sửa và xóa buổi tập tính lại volume và kỷ lục (A1, A2) | Kịch bản | PASS |
| UC13-SR01 | Hội viên chỉ xem và sửa buổi tập của chính mình | Phân quyền | PASS |
| `workout-log.spec.ts` | Nhập hiệp, Rest Timer, baseline rồi huy hiệu PR, lịch sử còn sau khi tải lại | E2E mobile | PASS |

### 4.2. Ca kiểm thử UC16 — Nhận thông báo nhắc lịch

| Mã ca | Nội dung | Kỹ thuật | Kết quả |
| :--- | :--- | :--- | :---: |
| UC16-BR01 (3 ca) | PT: đặt trước hơn 24h có đủ 24h và 2h; đặt trước 10h chỉ có 2h; trước dưới 2h không có | Giá trị biên | PASS |
| UC16-BR02 (2 ca) | Gói: mốc 7 và 3 ngày lúc 08:00; mốc đã qua không được tạo | Giá trị biên | PASS |
| UC16 (nội dung) | Thông báo PT và gói điều hướng đúng màn hình | Lớp tương đương | PASS |
| NTF-01/02 | Hộp thư riêng tư, mới nhất lên đầu, lọc theo loại, `unreadCount` giảm khi đọc, đọc của người khác trả 403 (SR01) | Phân quyền, lớp tương đương | PASS |
| NTF-03 | Nhắc lịch gửi cho hội viên và PT, không tạo trùng, hủy lịch thì hủy nhắc | Kịch bản | PASS |
| NTF-04 + BR03/BR04 | Reminder đến hạn thành thông báo đúng một lần; lịch không còn `CONFIRMED` thì hủy, không gửi | Kịch bản | PASS |
| NTF-05 + E1 | Push lỗi hoặc chưa đăng ký thiết bị thì hộp thư vẫn giữ, `DeliveryAttempt = FAILED` | Hộp xám, fault-based | PASS |
| NTF-05 (validate) | Từ chối thiết bị sai dữ liệu; ADMIN không được đăng ký | Lớp tương đương | PASS |
| NTF-04 (quyền) | Chỉ ADMIN chạy `dispatch-due`; `now` sai trả 400 | Phân quyền | PASS |
| BR02/BR03/A1/A2 | Gói `FROZEN` không gửi; đổi ngày kết thúc thì mốc nhắc dịch theo; đã gia hạn (`SCHEDULED`) thì bỏ qua | Kịch bản | PASS |
| `pauseRemindersOnFreeze` | Dịch các reminder đang chờ sang ngày kết thúc mới | Kịch bản | PASS |
| `notifications.spec.ts` | Badge trên chuông, mở hộp thư, bấm đọc, điều hướng, đánh dấu tất cả đã đọc | E2E mobile | PASS |

## 5. Lỗi và hạn chế ghi nhận

Bốn lỗi đầu **đã tái hiện trên `origin/main` sạch** (không có UC13/UC16), nên không do hai nhánh của người lập gây ra. Nguyên nhân gốc chưa được điều tra trong báo cáo này.

| # | Lỗi | Ảnh hưởng | Trạng thái |
| :-: | :--- | :--- | :--- |
| 1 | `auth.spec.ts:64` (đăng ký email, OTP, phiên) fail: tìm chữ `HI VIÊN MOBILE` đã đổi sau khi thiết kế lại Home | UC01, UC02 E2E mobile | Mở |
| 2 | `auth.spec.ts:207` (thiết bị khác thu hồi phiên) fail cùng nguyên nhân | UC02 E2E mobile | Mở |
| 3 | `dashboard.spec.ts:15` fail (xác nhận tái hiện trên `main`) | Dashboard web | Mở |
| 4 | `sales.spec.ts:107` (hủy đơn chờ thanh toán) fail (xác nhận tái hiện trên `main`) | Bán gói, web | Mở |
| 5 | `MetaballBottomDock` trong `App.tsx` rộng cố định 346px, tràn ngang ở màn hẹp hơn khoảng 390px | Giao diện mobile | Mở, chưa có test tự động |

Hạn chế của báo cáo này:
- Phần UC05, UC06, UC07 chưa được chạy vì PR của các bạn chưa merge; UC08, UC10, UC15 chưa có mã. Khi các PR được merge cần chạy lại các lệnh ở mục 3 và cập nhật mục 4.
- Chưa chạy trên thiết bị thật hay Expo Go; E2E mobile chạy bằng Expo Web trên Edge.
- UC16 chưa có PR; kết quả của UC16 chỉ đúng với commit `d7b7b57`.
- Hai lệnh `db:test` trên nhiều nhánh dùng chung một CSDL `fithub_test`; test của UC16 tự dọn reminder và thông báo sau khi chạy.

## 6. Cách chạy lại

```powershell
cd src
npm install
npm run db:local        # giữ chạy ở một terminal riêng
npm run typecheck
npm run build
npm run db:test
npm run test:mobile
npm run test:e2e
```
