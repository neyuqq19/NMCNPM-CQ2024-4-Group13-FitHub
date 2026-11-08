# FitHub Monorepo Architecture

Hệ thống FitHub được chuẩn hóa cấu trúc theo mô hình Clean Monorepo kiến trúc phân lớp hướng module (Modular Monorepo):

```
my-project-monorepo/
│
├── backend/                   # TẦNG BACKEND (NestJS API Server)
│   ├── src/
│   │   ├── config/            # Cấu hình hệ thống (Database, JWT, Cloud Storage...)
│   │   ├── common/            # Dùng chung toàn backend (Guards, Interceptors, Filters)
│   │   │   ├── guards/        # Bảo mật & Phân quyền (JwtAuthGuard, RolesGuard)
│   │   │   ├── interceptors/  # Chuẩn hóa dữ liệu trả về cho Web/Mobile (TransformInterceptor)
│   │   │   └── filters/       # Xử lý và gom lỗi tập trung (HttpExceptionFilter)
│   │   ├── database/          # Cấu hình DB, Migrations, Seeders (PrismaService, DatabaseModule)
│   │   ├── modules/           # LOGIC NGHIỆP VỤ (Chia theo tính năng khép kín)
│   │   │   ├── auth/          # Xác thực (Đăng nhập, phiên làm việc, thiết bị di động UC01)
│   │   │   │   ├── dto/       # Validate dữ liệu đầu vào từ Web/Mobile (LoginDto)
│   │   │   │   ├── auth.controller.ts
│   │   │   │   ├── auth.service.ts
│   │   │   │   └── auth.module.ts
│   │   │   ├── members/       # Quản lý người dùng, hồ sơ hội viên & gói tập cá nhân
│   │   │   │   ├── members.controller.ts
│   │   │   │   ├── members.service.ts
│   │   │   │   └── members.module.ts
│   │   │   └── packages/      # Quản lý danh mục gói dịch vụ phòng gym
│   │   │       ├── packages.controller.ts
│   │   │       ├── packages.service.ts
│   │   │       └── packages.module.ts
│   │   ├── app.module.ts      # Mô-đun gốc kết nối tất cả mô-đun con
│   │   └── main.ts            # Điểm chạy server (CORS, Pipes, Global Filters)
│   ├── prisma/                # Lược đồ cơ sở dữ liệu Prisma, Migrations & Dữ liệu mẫu (Seed)
│   └── package.json
│
├── web-client/                # TẦNG WEB APP (React 19 + Vite + TypeScript)
│   ├── public/                # File tĩnh (Logo FitHub, SVG, Icons)
│   ├── src/
│   │   ├── pages/             # Quản lý các trang nghiệp vụ (Members, Payments, Dashboard)
│   │   ├── components/        # Component UI dùng chung (Brand, PageHeading, Badge, Stat, Card)
│   │   ├── hooks/             # Custom hooks xử lý logic UI (useAuth)
│   │   ├── services/          # Gọi API từ Backend NestJS (apiService qua Fetch/Axios)
│   │   ├── store/             # Quản lý trạng thái toàn cục (StoreProvider, Context/Reducer)
│   │   └── utils/             # Hàm tiện ích (formatCurrencyVND, formatDateVN)
│   └── package.json
│
├── mobile-client/             # TẦNG MOBILE APP (React Native / Expo SDK 58)
│   ├── assets/                # Hình ảnh, icons, font chữ cho app di động
│   ├── src/
│   │   ├── screens/           # Các màn hình (Login, Home, MyPackage, QrCode, Profile...)
│   │   ├── components/        # Component UI đặc thù mobile (BottomDock, QRMatrix, Header...)
│   │   ├── navigation/        # Cấu hình luồng đi (AppNavigator, Routes)
│   │   ├── services/          # Gọi API từ Backend NestJS (dùng chung endpoint với Web)
│   │   ├── store/             # Quản lý trạng thái (authStore)
│   │   ├── utils/             # Hàm tiện ích dùng riêng cho mobile (formatters)
│   │   ├── sportsImages.ts    # Bộ hình ảnh VĐV thể thao & địa hình topo sắc nét
│   │   └── theme.ts           # Bảng màu thiết kế Volt Lime #DDF763, Matte Black #141416
│   └── package.json
│
├── shared/                    # TẦNG DÙNG CHUNG (Tùy chọn - Rất nên có)
│   ├── src/
│   │   ├── constants/         # Các hằng số, vai trò (ROLES), mã lỗi (ERROR_CODES), trạng thái
│   │   └── index.ts           # DTOs, Interfaces (CurrentUser, LoginRequest, MemberDto...)
│   └── package.json
│
└── docs/                      # Tài liệu dự án, cấu trúc kiến trúc & DB specs
```
