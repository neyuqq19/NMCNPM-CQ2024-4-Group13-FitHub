# Báo cáo kiểm thử PA4 — FitHub (Nhóm 13)

- **Người lập:** Nguyễn Trần Minh Trí (`24120461`) — Jira `SCRUM-108`
- **Ngày chạy:** 18/11/2026 (chạy lại; lần đầu 15/11/2026 trên `a60269a`)
- **Cây mã nguồn:** `origin/main` tại commit `3b28ead` (sau PR #18 — UC08 bản hoàn thiện), cộng các thay đổi của nhánh `test/scrum-108-tri-qa` nêu ở mục 5.
- **Nguyên tắc:** chỉ ghi PASS cho những gì đã chạy thật. Ca nào fail thì ghi fail kèm nguyên nhân.

---

## 1. Môi trường kiểm thử

| Mục | Giá trị |
| :--- | :--- |
| Hệ điều hành | Windows 11 Home |
| Node.js | v24.15.0 (repo yêu cầu `>=22.13`) |
| Backend | NestJS 11, Prisma 6.19.3 |
| Cơ sở dữ liệu | PostgreSQL nhúng (`npm run db:local`), database `fithub_test` tại `127.0.0.1:55432`, không đụng Supabase |
| Trình duyệt E2E | Microsoft Edge (Playwright); E2E mobile chạy trên Expo Web |

## 2. Kết quả chạy lệnh (tại `src/`)

| Lệnh | Kết quả | Ghi chú |
| :--- | :---: | :--- |
| `npm run typecheck` | **PASS** | 4 workspace (contracts, api, web, mobile) |
| `npm run build` | **PASS** | contracts, api, web (Vite chỉ cảnh báo chunk > 500 kB) |
| `npm run db:test` (= `npm test`) | **128/129 PASS** | Node Test Runner + Supertest, 18 file; 1 fail ở `sales.test.ts` (lỗi #2, mục 4) |
| Test UC15 chạy riêng (`uc15-payments.test.ts`, `vnpay.crypto.test.ts`) | **23/23 PASS** | Cần API chạy ở cổng 3101 với `VNPAY_MODE=SIMULATED`; chưa nằm trong `db:test` (lỗi #3) |
| `npm run test:unit -w @fithub/mobile` | **5/5 PASS** | `api-host.test.ts` |
| `npm run test:e2e` (web) | **33/33 PASS** | Ca camera check-in từng chập chờn (lỗi #5) lần này PASS ngay lượt đầu |
| `npm run test:mobile` | **11/13 PASS** | 2 ca `auth.spec.ts` fail do test cũ (lỗi #4) |

Tổng cộng: **200/203 ca tự động PASS** (129 + 23 + 5 + 33 + 13). Cả 3 ca fail đều do test cũ chưa cập nhật, không phải lỗi nghiệp vụ; chi tiết ở mục 4.

So với lần chạy 15/11 trên `a60269a` (197/201): PR #18 thêm 2 ca UC08 vào `pt-bookings.test.ts` (đều PASS), và web E2E hết lỗi trắng trang nhờ bản sửa trên `main`.

## 3. Kết quả theo từng Use Case

Danh sách 12 Use Case lấy từ `src/docs/TIEN_DO_CHUC_NANG.md`. Jira ghi "13 UCs" nhưng tài liệu chỉ liệt kê 12; **cần Quyền xác nhận UC thứ 13**.

| UC | Tên | Người phụ trách | Test backend | Test E2E | Kết luận |
| :---: | :--- | :--- | :--- | :--- | :---: |
| UC01 | Đăng ký & xác thực OTP | Quyền | 6/6 PASS (`auth-registration`) | Mobile `auth.spec` 4/6 (2 fail do test cũ) | **PASS**, E2E cần sửa test |
| UC02 | Đăng nhập, khóa tạm, phiên duy nhất | Quyền | 2/2 PASS | Web `login.spec` 8/8; mobile `auth.spec` như trên | **PASS**, E2E cần sửa test |
| UC03 | Check-in QR động | Quyền | 18/18 PASS (`check-ins`) | Web 3/3, mobile 3/3 | **PASS** |
| UC04 | Quản lý hồ sơ hội viên | Quyền | 8/8 PASS (`members`) | Web `ui.spec` 7/7 | **PASS** |
| UC05 | Quản lý gói tập | Hợp | 7/7 PASS (`packages-memberships`) | Chưa có E2E | **PASS** (backend) |
| UC06 | Hồ sơ chuyên môn PT | Liệu | 4/4 PASS (`trainers`, `trainers.service.spec`) | Web `trainers.spec` 1/1, mobile 1/1 | **PASS** |
| UC07 | Lịch làm việc PT | Liệu | 5/5 PASS (`working-slots`, `trainers.service.spec`) | Web `trainer-schedule.spec` 1/1 | **PASS** |
| UC08 | Đặt lịch hẹn PT 1-1 | Quang | 14/14 PASS (`pt-bookings-rules`, `pt-bookings`; gồm 2 ca mới của PR #18: xem trước đặt lịch chỉ đọc, 3 khung giờ trống gần nhất) | Chưa có E2E trên `main`; lỗi trắng trang đã sửa (lỗi #1) | **PASS** (backend) |
| UC10 | Quản lý thiết bị | Hợp | 5/5 PASS (`equipments`) | Chưa có E2E | **PASS** (backend) |
| UC13 | Ghi nhật ký tập luyện | Trí | 12/12 PASS (9 tích hợp + 3 unit) | Mobile `workout-log.spec` 1/1 | **PASS** |
| UC15 | Thanh toán gói tập | Quang | 23/23 PASS (chạy riêng) + `sales` 8/9 | Web `sales.spec` 2/2 | **PASS**, 1 test `sales` cũ (lỗi #2) |
| UC16 | Nhận thông báo nhắc lịch | Trí | 16/16 PASS (14 tích hợp + 2 unit) | Mobile `notifications.spec` 1/1 | **PASS** |

Ngoài các UC, `database.test.ts` (ràng buộc CSDL) và `dashboard.spec` / `layout.spec` / `brand.spec` (web dùng chung) đều PASS.

### 3.1. Unit test mới của SCRUM-108

File `src/backend/src/workouts/__tests__/workouts.service.spec.ts`, chạy trong `db:test`. Prisma, `AuthService` và push adapter được giả lập nên không cần database.

| # | Ca kiểm thử | Kỹ thuật | Kết quả |
| :-: | :--- | :--- | :---: |
| 1 | UC13 — tài khoản không phải `MEMBER` bị chặn `ROLE_FORBIDDEN`, không mở giao dịch nào | Phân quyền | PASS |
| 2 | UC13 — xóa buổi tập của hội viên khác trả `FORBIDDEN`, không xóa (SR01) | Phân quyền | PASS |
| 3 | UC13 — `pageSize = 51` (vượt biên 50) và ngày `2026-02-30` trả `VALIDATION_ERROR` trước khi truy vấn | Giá trị biên | PASS |
| 4 | UC16 — đánh dấu đã đọc thông báo của người khác trả `FORBIDDEN`, không cập nhật (SR01) | Phân quyền | PASS |
| 5 | UC16 — push lỗi vẫn giữ thông báo trong hộp thư, ghi `DeliveryAttempt = FAILED` (BR04, E1) | Fault-based | PASS |

### 3.2. Ca kiểm thử UC13 — Ghi nhật ký tập luyện

| Mã ca | Nội dung | Kỹ thuật | Kết quả |
| :--- | :--- | :--- | :---: |
| UC13-BR02/BR03 | Epley 1RM chỉ tính cho hiệp `R` có tạ ngoài | Giá trị biên | PASS |
| UC13-BR01 | `totalVolume` bằng tổng `reps × weightKg` | Hộp trắng | PASS |
| UC13-BR04 | Buổi đầu là baseline, chỉ 1RM lớn hơn hẳn mới là PR | Giá trị biên | PASS |
| UC13 (streak) | Chuỗi ngày tập tính đến hôm nay hoặc hôm qua | Hộp trắng | PASS |
| UC13 (validate) | Từ chối `setType` sai, `reps`/`weightKg` ngoài khoảng, buổi rỗng | Lớp tương đương | PASS |
| UC13-01 | Kịch bản nghiệm thu: baseline rồi 1RM cao hơn là PR | Kịch bản | PASS |
| UC13-02 | Hiệp W/D/F và bài không tạ không tạo kỷ lục | Lớp tương đương | PASS |
| UC13-03 | Sửa và xóa buổi tập tính lại volume và kỷ lục (A1, A2) | Kịch bản | PASS |
| UC13-SR01 | Hội viên chỉ xem và sửa buổi tập của chính mình | Phân quyền | PASS |
| `workout-log.spec.ts` | Nhập hiệp, Rest Timer, baseline rồi huy hiệu PR, lịch sử còn sau khi tải lại | E2E mobile | PASS |

### 3.3. Ca kiểm thử UC16 — Nhận thông báo nhắc lịch

| Mã ca | Nội dung | Kỹ thuật | Kết quả |
| :--- | :--- | :--- | :---: |
| UC16-BR01 (3 ca) | Đặt trước hơn 24h có nhắc 24h và 2h; trước 10h chỉ có 2h; trước dưới 2h không có | Giá trị biên | PASS |
| UC16-BR02 (2 ca) | Nhắc gói mốc 7 và 3 ngày lúc 08:00; mốc đã qua không tạo | Giá trị biên | PASS |
| UC16 (nội dung) | Thông báo điều hướng đúng màn hình; suy lại giờ bắt đầu từ reminder | Lớp tương đương | PASS |
| NTF-01/02 | Hộp thư riêng tư, mới nhất lên đầu, lọc theo loại, `unreadCount` giảm khi đọc | Phân quyền | PASS |
| NTF-03 | Nhắc lịch cho hội viên và PT, không trùng, hủy lịch thì hủy nhắc | Kịch bản | PASS |
| NTF-04 + BR03/BR04 | Reminder đến hạn thành thông báo đúng một lần; lịch không còn `CONFIRMED` thì hủy | Kịch bản | PASS |
| NTF-04 (quyền) | Chỉ ADMIN chạy `dispatch-due`; `now` sai trả 400 | Phân quyền | PASS |
| NTF-05 + E1 | Push lỗi hoặc chưa đăng ký thiết bị thì hộp thư vẫn giữ, attempt `FAILED` | Fault-based | PASS |
| NTF-05 (validate) | Từ chối thiết bị sai dữ liệu; ADMIN không được đăng ký | Lớp tương đương | PASS |
| BR02/BR03/A1/A2 | Gói `FROZEN` không gửi; đổi ngày kết thúc thì mốc dịch theo; đã gia hạn thì bỏ qua | Kịch bản | PASS |
| `pauseRemindersOnFreeze` | Dịch reminder đang chờ sang ngày kết thúc mới | Kịch bản | PASS |
| `notifications.spec.ts` | Badge chuông, mở hộp thư, đọc, điều hướng, đánh dấu tất cả đã đọc | E2E mobile | PASS |

## 4. Lỗi và hạn chế ghi nhận

| # | Lỗi | Thuộc | Ảnh hưởng | Trạng thái |
| :-: | :--- | :--- | :--- | :--- |
| 1 | Web Admin trắng trang khi chưa đăng nhập: `App.tsx` đọc `user!.role` cho route `pt-bookings` ngay cả khi `user = null` (`Cannot read properties of null (reading 'role')`). Lần chạy đầu cả 33 ca E2E web đều fail vì lỗi này. | UC08, commit `67b482c` | Toàn bộ web | **Đã sửa** trên `main` (commit `ab9ad8a`, PR #18: chưa đăng nhập thì chuyển về `/login`) |
| 2 | `sales.test.ts` "DB sales 05": xác nhận hóa đơn đã hủy nay trả `PAYMENT_ALREADY_PROCESSED` thay vì `PAYMENT_CANCELLED`. Hóa đơn vẫn bị chặn đúng; test UC15 mới cũng dùng mã `PAYMENT_ALREADY_PROCESSED`, nên đây là test cũ chưa cập nhật. | UC15, commit `3aae5dc` | Chỉ test | Mở — Quang cập nhật test |
| 3 | `uc15-payments.test.ts` và `vnpay.crypto.test.ts` chưa được thêm vào `scripts/test-database.mjs`, và test tích hợp cần một API chạy sẵn ở cổng 3101, nên `npm test` không kiểm UC15. | UC15 | Quy trình test | Mở — Quang đưa vào `db:test` |
| 4 | Mobile `auth.spec.ts:64` và `:207` tìm chữ `HI VIÊN MOBILE` / `HI HOÀNG NAM`, đã đổi sau khi thiết kế lại Home. | UC01/UC02 | Chỉ test | Mở — Quyền cập nhật test |
| 5 | Web `check-in.spec.ts:127` (camera) fail một lần ở lượt chạy 15/11, chạy lại 3 lần đều PASS; lượt 18/11 PASS ngay. | UC03 | Ca chập chờn | Theo dõi |
| 6 | UC05, UC08, UC10 chưa có E2E web trên `main`; UC15 VNPay chỉ kiểm ở chế độ `SIMULATED`. Đã có nhánh đang làm nhưng chưa merge nên chưa tính vào báo cáo: `test/scrum-111-hop-uc08-qa` (E2E + bằng chứng UC08) và `test/uc05-quang` (fixture + bằng chứng UC05). | — | Độ phủ | Mở |

Hạn chế khác:
- Nhánh `feature/uc05-hop-packages` còn 1 commit chưa merge, sửa migration `202611130001_uc05_freeze_lifecycle_fix` khác `main` khoảng 10 dòng. Báo cáo chạy theo bản trên `main`.
- Chưa chạy trên thiết bị thật hay Expo Go.

## 5. Thay đổi mã trong nhánh `test/scrum-108-tri-qa`

| File | Thay đổi |
| :--- | :--- |
| `src/backend/src/workouts/__tests__/workouts.service.spec.ts` | Mới: 5 unit test (mục 3.1) |
| `src/scripts/test-database.mjs` | Thêm file unit test trên vào `db:test` |
| `src/backend/test/notifications.test.ts` | Sửa fixture UC16: từ khi UC08 thêm bảng `Appointment`, các `appointmentId` ngẫu nhiên bị coi là đã hủy nên 2 ca NTF-04/NTF-05 fail. Test UC16 nay giả lập nguồn lịch hẹn luôn `CONFIRMED` (ca BR03 vẫn tự đổi sang "đã hủy"); tích hợp thật với UC08 do test `pt-bookings` kiểm. |
| `src/web-client/src/App.tsx` | Không còn thay đổi: lỗi #1 đã được sửa trên `main` bằng PR #18, nhánh QA dùng bản đó khi merge |

## 6. Cách chạy lại

```powershell
cd src
npm install
npm run db:local        # giữ chạy ở một terminal riêng
npm run typecheck
npm run build
npm run db:test
npm run test:unit -w @fithub/mobile
npm run test:mobile
npm run test:e2e
```

Chạy test UC15 (cần API ở cổng 3101 trên `fithub_test`, đã seed):

```powershell
cd src\backend
$env:DATABASE_URL="postgresql://fithub:fithub_local_only@127.0.0.1:55432/fithub_test?schema=public"
$env:DIRECT_URL=$env:DATABASE_URL
npx tsx prisma/seed.ts
$env:PORT="3101"; $env:VNPAY_MODE="SIMULATED"; node dist/src/main.js   # terminal riêng
node --import tsx --test --test-concurrency=1 test/uc15-payments.test.ts test/vnpay.crypto.test.ts
```
