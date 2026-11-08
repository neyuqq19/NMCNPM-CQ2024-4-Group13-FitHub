# FitHub — mã nguồn PA4

Mobile đã bổ sung đăng ký email OTP, đăng nhập/đăng xuất và lưu phiên; xem [hướng dẫn cấu hình và kiểm thử](docs/MOBILE-AUTH.md). Chạy `npm run test:mobile` để kiểm thử riêng luồng mobile trên Expo web với database test.

UC04 đã tích hợp: đăng nhập Admin, tìm/lọc/phân trang hội viên, xem hồ sơ và gói chỉ đọc, thêm/sửa, ngừng sử dụng và thu hồi phiên. Web React gọi NestJS; chỉ backend truy cập PostgreSQL. Tổng quan, danh mục gói, đăng ký/thu tiền tại quầy và lịch sử giao dịch đã dùng API/database; không lưu dữ liệu nghiệp vụ trong localStorage. Xem [tích hợp dữ liệu và luồng bán gói](docs/DATABASE-SALES.md).

## Chạy ứng dụng

Mở PowerShell tại `D:\DoAnNMCNPM\Group13-FitHub\src`:

```powershell
npm ci
Copy-Item backend/.env.example backend/.env # chỉ khi chưa có .env
# Cấu hình DATABASE_URL và DIRECT_URL trong backend/.env theo môi trường được cấp.
npm run db:generate
npm run db:migrate
# Chỉ seed khi cần dữ liệu phát triển, không bắt buộc để khởi động:
npm run db:seed
npm run dev:api
```

Terminal khác tại cùng thư mục:

```powershell
npm run dev:web
```

Mở [Web Admin](http://127.0.0.1:5173). Mặc định API `http://127.0.0.1:3000`; để đổi, đặt `VITE_API_BASE_URL` trong `web-client/.env`. Tài khoản seed: `admin@fithub.vn`, mật khẩu theo `SEED_PASSWORD` lúc seed (mẫu: `FitHubDemo!2026`). Seed không đặt lại mật khẩu tài khoản đã có. Nếu cổng 3000 đang dùng bởi ứng dụng khác, đổi `PORT` của API và URL trên web tương ứng.

Với database local, dùng cấu hình Option B trong `.env.example`, chạy `npm run db:local` ở terminal riêng rồi migration/seed. Dữ liệu local ở `.local/`; cấu hình và bí mật trong `.env` không được commit. Windows: nếu Prisma generate báo EPERM trên DLL, dừng tiến trình backend/Prisma Studio đang dùng client trước khi chạy lại, sau đó khởi động lại.

## Kiểm thử

```powershell
npm run typecheck
npm run build
# Giữ npm run db:local chạy ở terminal khác:
npm run db:test
npm run test:e2e
```

API/database tests và Playwright chỉ nhận database local tên `fithub_test`; không chạy test ghi dữ liệu vào Supabase. Playwright dùng Microsoft Edge đã cài, tự chạy API cổng 3101 và web cổng 5174, không tái sử dụng server đang chạy. Dữ liệu mẫu kiểm thử E2E được giữ lại trong database test để đối chiếu. Ảnh desktop/form nằm trong `web-client/test-results/`; lỗi có screenshot và trace.

## Tài liệu

- [Web và phạm vi tích hợp](web-client/README.md)
- [Hợp đồng API](docs/API_SPECIFICATION.md)
- [Kết quả kiểm thử UC04](docs/UC04-TEST-REPORT.md)
- [Database](docs/DATABASE.md)

Các thao tác sửa hồ sơ không đổi liên hệ đăng nhập, trạng thái tài khoản hay quyền gói. Tài khoản tạo tại quầy cần quy trình xác minh riêng; ngừng sử dụng bảo toàn lịch sử và chưa có chức năng khôi phục trong đợt này.
