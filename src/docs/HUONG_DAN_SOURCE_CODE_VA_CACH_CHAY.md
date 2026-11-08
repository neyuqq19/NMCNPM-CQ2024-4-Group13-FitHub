# Hướng Dẫn Source Code Hiện Tại & Cách Chạy Dự Án FitHub (Nhóm 13 — PA4)

Tài liệu này giúp tất cả thành viên trong nhóm nắm rõ **kiến trúc mã nguồn hiện tại trong `src/`**, **những phần đã chạy thật 100%**, **vị trí từng người cần code thêm trong PA4**, và **cách cài đặt — khởi chạy — kiểm thử toàn bộ hệ thống** trên máy cá nhân.

---

## 1. Tổng Quan Kiến Trúc Clean Monorepo (`src/`)

Dự án sử dụng kiến trúc **Clean Monorepo** quản lý bằng **NPM Workspaces** (yêu cầu **Node.js `>= 22.13`**). Toàn bộ mã nguồn nằm trong thư mục `src/` gồm 4 workspaces chính:

```text
src/
├── backend/                  # (@fithub/api) Backend NestJS 11 + Prisma ORM + PostgreSQL (Port 3000)
│   ├── prisma/
│   │   ├── schema.prisma     # Định nghĩa toàn bộ bảng Database PostgreSQL
│   │   ├── migrations/       # Lịch sử 7 bản migrations đã khởi tạo
│   │   └── seed.ts           # Script tạo 28 tài khoản mẫu (Admin, PT, Hội viên...)
│   └── src/
│       ├── main.ts           # Điểm khởi chạy server (lắng nghe 0.0.0.0:3000)
│       ├── app.module.ts     # Module gốc kết nối các phân hệ
│       ├── app.controller.ts # Health check (GET / và GET /api/health)
│       └── modules/          # Các module nghiệp vụ Backend
│           ├── auth/         # [ĐÃ XONG 100%] UC01 (Đăng ký + OTP) & UC02 (Đăng nhập + RBAC)
│           ├── check-ins/    # [ĐÃ XONG 100%] UC03 (Quét mã QR Check-in + Kiểm tra điều kiện)
│           └── members/      # [ĐÃ XONG 100%] UC04 (Quản lý hồ sơ hội viên)
│
├── web-client/               # (@fithub/web) Web Admin & Lễ tân — React 18 + Vite (Port 5173)
│   └── src/
│       ├── App.tsx           # Layout chính, định tuyến & trang Tổng quan (Home)
│       ├── api.ts            # Các hàm gọi REST API xuống Backend
│       ├── store.tsx         # [CẦN THAY THẾ Ở PA4] Dữ liệu giả useDemo() tạm thời
│       └── pages/
│           ├── CheckIn.tsx   # [ĐÃ XONG 100%] Màn hình quét QR tại quầy Lễ tân (UC03)
│           ├── Members.tsx   # [ĐÃ XONG 100%] Màn hình quản lý hồ sơ hội viên (UC04)
│           └── Payments.tsx  # [ĐANG DÙNG useDemo()] Gói tập (UC05) & Thanh toán (UC15)
│
├── mobile-client/            # (@fithub/mobile) Ứng dụng Hội viên — Expo React Native SDK 54
│   ├── App.tsx               # Navigation chính & các màn hình 01_HOME, 02_MY_PACKAGE, 05_AI_PLAN
│   └── src/
│       ├── api.ts            # Tự động nhận diện LAN IP & gọi API xuống Backend
│       ├── AuthPanel.tsx     # [ĐÃ XONG 100%] Màn hình Đăng nhập / Đăng ký / Nhập OTP (UC01, UC02)
│       └── CheckInPanel.tsx  # [ĐÃ XONG 100%] Màn hình hiển thị thẻ QR Check-in (UC03)
│
├── shared/                   # (@fithub/contracts) Kiểu dữ liệu, DTO, Enum dùng chung cho cả 3 nơi
│   └── src/index.ts
│
└── docs/                     # Toàn bộ tài liệu phân công PA4, tiến độ Use Case và Jira Tasks
```

---

## 2. Những Gì Đã Có Sẵn vs. Những Gì Từng Thành Viên Cần Làm Trong PA4

### A. Phần ĐÃ HOÀN THÀNH 100% (Không cần viết lại)
Do **Nguyễn Hữu Quyền (`24120424`)** đã xây dựng sẵn:
1. **`UC01` — Đăng ký tài khoản & Xác minh Email OTP**: `backend/src/modules/auth/registration.*` + `mobile-client/src/AuthPanel.tsx`.
2. **`UC02` — Đăng nhập & Phân quyền RBAC**: Khóa 15 phút khi nhập sai mật khẩu 5 lần, ràng buộc 1 thiết bị cho Member trên Mobile (`backend/src/modules/auth/auth.*`).
3. **`UC03` — Check-in phòng tập bằng mã QR**: Kiểm tra thẻ hội viên, gói tập `ACTIVE`, chống quét lặp 30 phút (`backend/src/modules/check-ins/*`, `web-client/src/pages/CheckIn.tsx`, `mobile-client/src/CheckInPanel.tsx`).
4. **`UC04` — Quản lý hồ sơ hội viên**: Tìm kiếm, lọc, khóa/mở khóa, duyệt xác minh hội viên (`backend/src/modules/members/*`, `web-client/src/pages/Members.tsx`).

### B. Bản Đồ Vị Trí Code Dành Cho Từng Thành Viên Trong PA4

| Thành viên | Use Cases phụ trách | Nơi cần thêm/sửa ở `backend/` | Nơi cần thêm/sửa ở `web-client/` hoặc `mobile-client/` |
| :--- | :--- | :--- | :--- |
| **1. Nguyễn Hữu Quyền** (`24120424`) | **`UC17`** (Dashboard Summary) | Thêm `GET /api/dashboard/summary` trong `backend/src/app.controller.ts` | Nối dữ liệu thật vào hàm `Home` trong `web-client/src/App.tsx` (dòng 242–343), xóa `<Notice>Bản xem thử...</Notice>` |
| **2. Trịnh Văn Hợp** (`24120320`) | **`UC05`** (Gói tập & Đăng ký `PENDING`)<br>**`UC10`** (Thiết bị phòng tập) | • Tạo `backend/src/modules/packages/`<br>• Tạo `backend/src/modules/memberships/`<br>• Tạo `backend/src/modules/equipments/` | • Sửa `PackagePage` (dòng 18–187) trong `web-client/src/pages/Payments.tsx` (thay `useDemo()`)<br>• Tạo trang `web-client/src/pages/Equipments.tsx` |
| **3. Trương Minh Quang** (`24120415`) | **`UC15`** (Thu tiền mặt ACID)<br>**`UC08`** (Đặt lịch hẹn PT) | • Tạo `backend/src/modules/payments/` (`prisma.$transaction`)<br>• Tạo `backend/src/modules/pt-bookings/` | • Sửa `PaymentPage`, `SuccessPage`, `HistoryPage` (dòng 189–520) trong `web-client/src/pages/Payments.tsx`<br>• Tạo trang `web-client/src/pages/PtBookings.tsx` |
| **4. Võ Nhật Liệu** (`24120366`) | **`UC06`** (Hồ sơ chuyên môn PT)<br>**`UC07`** (Lịch làm việc PT) | • Tạo `backend/src/modules/trainers/` (quản lý cả `TrainerProfile` và `TrainerSlot`) | • Tạo trang `web-client/src/pages/Trainers.tsx` (danh sách PT + quản lý ca làm việc trống/đã đặt) |
| **5. Nguyễn Trần Minh Trí** (`24120461`) | **`UC13`** (Nhật ký tập luyện)<br>**`UC16`** (Thông báo & Gói tập Mobile) | • Tạo `backend/src/modules/workouts/`<br>• Tạo `backend/src/modules/notifications/` | • Tạo `mobile-client/src/WorkoutLogPanel.tsx`<br>• Sửa `01_HOME` và `02_MY_PACKAGE` trong `mobile-client/App.tsx` (dòng 189–315) |

---

## 3. Hướng Dẫn Cài Đặt & Chạy Dự Án Lần Đầu

### Bước 1: Kiểm tra phiên bản Node.js & Cài đặt thư viện
Mở terminal tại thư mục gốc `src/`:
```powershell
cd D:\DoAnNMCNPM\Group13-FitHub\src
node -v   # Đảm bảo >= v22.13.0
npm install
```

### Bước 2: Cấu hình biến môi trường (`.env`)

#### 1. File `src/backend/.env`
Copy từ `src/backend/.env.example` sang `src/backend/.env`:
```powershell
Copy-Item backend\.env.example backend\.env
```
Mở `src/backend/.env` và kiểm tra:
- **Cách A — Dùng chung Database Supabase PostgreSQL của nhóm** *(Khuyến nghị khi ghép code)*:
  Nhận chuỗi `DATABASE_URL` và `DIRECT_URL` từ nhóm trưởng (Quyền) và dán vào `backend/.env`.
- **Cách B — Chạy PostgreSQL Local tự động** *(Nếu muốn test độc lập trên máy cá nhân)*:
  Giữ nguyên cấu hình mặc định trong `.env.example` (`localhost:55432`) và bật Postgres cục bộ bằng lệnh `npm run db:local`.
- Đảm bảo có mật khẩu seed mẫu:
  ```env
  SEED_PASSWORD=FitHubDemo!2026
  ```

#### 2. File `src/mobile-client/.env` *(Dành cho người chạy Mobile App)*
Tạo file `src/mobile-client/.env` với địa chỉ IPv4 LAN của máy tính đang chạy Backend (xem bằng lệnh `ipconfig`):
```env
EXPO_PUBLIC_API_URL=http://192.168.1.54:3000
```
*(Lưu ý: `mobile-client/src/api.ts` đã được cấu hình tự động nhận diện IP LAN qua `Constants.expoConfig.hostUri` khi quét bằng Expo Go, nhưng khai báo thêm `.env` giúp cố định địa chỉ khi cần).*

---

### Bước 3: Khởi tạo Prisma Client, Chạy Migration & Seed dữ liệu mẫu

Tại thư mục `src/`, chạy lệnh:
```powershell
npm run db:prepare
```
Lệnh này sẽ tự động chạy tuần tự 3 bước:
1. `npm run db:generate`: Sinh bộ Prisma Client từ `backend/prisma/schema.prisma`.
2. `npm run db:migrate`: Đẩy toàn bộ các bảng trong `backend/prisma/migrations` lên Database.
3. `npm run db:seed`: Tạo sẵn **28 tài khoản mẫu** (Admin, PT, Hội viên...) với mật khẩu mặc định trong `SEED_PASSWORD`.

---

## 4. Cách Khởi Chạy Từng Thành Phần (Backend, Web, Mobile)

Mở các cửa sổ Terminal riêng tại thư mục gốc `src/`:

### 1. Chạy Backend API (`http://localhost:3000`)
```powershell
npm run dev:api
```
- **Kiểm tra Backend đã sống chưa**: Mở trình duyệt vào `http://localhost:3000/api/health` (hoặc `http://localhost:3000`). Nếu trả về `{"status":"ok","database":"up"}` là thành công.
- **Lưu ý nếu gặp lỗi `EADDRINUSE: address already in use 0.0.0.0:3000`**:
  Có nghĩa là một cửa sổ terminal khác đang chạy sẵn Backend ở cổng 3000. Bạn có thể tắt tiến trình cũ bằng lệnh PowerShell:
  ```powershell
  Stop-Process -Id (Get-NetTCPConnection -LocalPort 3000 -State Listen).OwningProcess -Force
  ```

### 2. Chạy Web Admin & Lễ tân (`http://localhost:5173`)
```powershell
npm run dev:web
```
- Mở trình duyệt tại: `http://localhost:5173`

### 3. Chạy Mobile App (Expo React Native)
```powershell
npm run dev:mobile
```
- Điện thoại cài ứng dụng **Expo Go** (cùng mạng Wi-Fi với máy tính) và quét mã QR hiện trên terminal, hoặc nhấn `a` để mở trên máy ảo Android / `w` để mở bản Web preview.

---

## 5. Danh Sách Tài Khoản Mẫu Để Đăng Nhập & Kiểm Thử

Sau khi chạy `npm run db:seed`, bạn có thể đăng nhập ngay bằng các tài khoản sau (Mật khẩu chung: **`FitHubDemo!2026`**):

| Vai trò (Role) | Email đăng nhập | Mật khẩu | Nền tảng sử dụng | Ghi chú trạng thái |
| :--- | :--- | :--- | :---: | :--- |
| **ADMIN** (Quản trị viên) | `admin@fithub.vn` | `FitHubDemo!2026` | **Web Admin** (`:5173`) | Toàn quyền quản lý hệ thống |
| **TRAINER** (Huấn luyện viên PT) | `trainer@fithub.vn` | `FitHubDemo!2026` | **Web Admin** (`:5173`) | Xem lịch làm việc, quản lý buổi tập PT |
| **MEMBER** (Hội viên hợp lệ) | `minhanh@example.com` | `FitHubDemo!2026` | **Mobile App** | Mã `HV001` — Đã có gói tập `ACTIVE` (Quét QR được `ALLOWED`) |
| **MEMBER** (Hội viên hợp lệ 2) | `hoangnam@example.com` | `FitHubDemo!2026` | **Mobile App** | Mã `HV002` — Đang `ACTIVE` |
| **MEMBER** (Chờ xác minh OTP) | `thuha@example.com` | `FitHubDemo!2026` | **Mobile App** | Mã `HV003` — Trạng thái `PENDING_VERIFY` |
| **MEMBER** (Gói hết hạn) | `expired@example.com` | `FitHubDemo!2026` | **Mobile App** | Dùng để test quét QR bị từ chối (`MEMBERSHIP_EXPIRED`) |

---

## 6. Các Lệnh Kiểm Tra Chất Lượng Trước Khi Tạo Pull Request

Trước khi push code hoặc tạo Pull Request lên nhánh chung của nhóm, **bắt buộc** chạy 3 lệnh sau tại thư mục `src/` và đảm bảo không có lỗi:

```powershell
# 1. Kiểm tra lỗi kiểu dữ liệu TypeScript trên cả 4 workspaces (shared, backend, web, mobile)
npm run typecheck

# 2. Kiểm tra build toàn bộ dự án
npm run build

# 3. Chạy bộ kiểm thử tự động (Unit / Integration Tests)
npm test
```

Ngoài ra, bạn có thể mở giao diện quản lý dữ liệu trực quan **Prisma Studio** tại `http://127.0.0.1:5555` bằng lệnh:
```powershell
npm run db:studio
```

---

## 7. Quy Tắc Phối Hợp Nhóm Khi Sửa `schema.prisma` & `shared`

1. **Khi thêm bảng mới vào `backend/prisma/schema.prisma`**:
   - Chỉ thêm model/enum phụ trách của mình, **tuyệt đối không xóa hoặc đổi tên cột** của các bảng đã có (`User`, `Member`, `OtpChallenge`, `CheckInRecord`, `AuditLog`).
   - Sau khi sửa `schema.prisma`, chạy `npm run db:generate` để cập nhật kiểu dữ liệu Prisma Client.
   - Thông báo cho nhóm trưởng (**Quyền**) khi tạo migration mới để đồng bộ lên Supabase chung.
2. **Khi thêm kiểu DTO/Interface vào `shared/src/index.ts`**:
   - Chạy `npm run build -w @fithub/contracts` (hoặc `npm run typecheck`) để `backend`, `web-client` và `mobile-client` nhận diện ngay kiểu dữ liệu mới.
3. **Tài liệu công việc chi tiết của từng thành viên**:
   - Xem bảng tổng hợp tiến độ: [TIEN_DO_CHUC_NANG.md](./TIEN_DO_CHUC_NANG.md)
   - Xem danh sách Jira Tasks: [JIRA_TASKS_PA4.md](./JIRA_TASKS_PA4.md)
   - Xem file hướng dẫn riêng của từng người:
     - [QUYEN_PLATFORM_AUTH_TASKS.md](./QUYEN_PLATFORM_AUTH_TASKS.md)
     - [HOP_PACKAGES_EXERCISE_TASKS.md](./HOP_PACKAGES_EXERCISE_TASKS.md)
     - [QUANG_PAYMENTS_REPORTS_TASKS.md](./QUANG_PAYMENTS_REPORTS_TASKS.md)
     - [LIEU_MEMBER_MANAGEMENT_TASKS.md](./LIEU_MEMBER_MANAGEMENT_TASKS.md)
     - [TRI_MOBILE_TESTING_TASKS.md](./TRI_MOBILE_TESTING_TASKS.md)
