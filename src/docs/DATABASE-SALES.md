# Tổng quan, gói tập và giao dịch dùng database

Ngày tích hợp: 08/11/2026. React gọi NestJS; chỉ backend truy cập PostgreSQL/Supabase. Không sao chép dữ liệu mẫu từ localStorage lên database.

## Luồng tại quầy

1. Admin mở hồ sơ hội viên đã xác minh và đang hoạt động → **Đăng ký gói tập**.
2. Chọn gói từ danh mục database và ngày bắt đầu. Ngày gợi ý nối tiếp kỳ gym đã mua sau cùng; từ chối kỳ bị chồng lấn. Gói bảo lưu cần được xử lý trước khi gia hạn.
3. **Tiếp tục thu tiền** tạo một đăng ký `PENDING_PAYMENT` và một khoản thu `PENDING` trong transaction. Chưa cấp quyền vào gym.
4. Chỉ sau khi nhận đủ tiền mặt, Admin bấm xác nhận. Backend kiểm tra số tiền, tài khoản, kỳ sử dụng, cập nhật thanh toán và gói `ACTIVE`/`SCHEDULED` cùng nhật ký trong một transaction.
5. Giao dịch chờ có thể hủy bằng bước xác nhận riêng. Giữ đăng ký và khoản thu với trạng thái `CANCELLED`; không hoàn/hủy khoản đã thu qua thao tác này.
6. Tải lại URL giao dịch, lịch sử và hồ sơ đều đọc dữ liệu server. Mất phản hồi có thể gửi lại cùng yêu cầu; không tạo khoản thu/gói thứ hai.

Chỉ triển khai thu tiền mặt tại quầy trong đợt tích hợp này. Chưa thêm chuyển khoản, cổng thanh toán, hoàn tiền hoặc nghiệp vụ bảo lưu/khôi phục.

## API

Tất cả endpoint mới yêu cầu Bearer session của ADMIN. DTO ở `@fithub/contracts`; UUID dùng trong URL, mã DK/GD để hiển thị.

| Endpoint | Hợp đồng |
| --- | --- |
| `GET /api/dashboard` | Ngày Việt Nam, số hội viên hoạt động/chờ xác minh, check-in hôm nay, tổng thu và 5 khoản gần đây trong ngày |
| `GET /api/members/:id/purchase-options` | Thông tin hội viên, danh mục đang cung cấp, ngày bắt đầu gợi ý và khoản chờ có thể tiếp tục |
| `POST /api/members/:id/memberships` | `{requestId,packageId,startsOn,expectedPrice}` → giao dịch và đăng ký chờ |
| `GET /api/payments` | `member`, `status`, `q`, `page`, `pageSize`; trả `{items,total,page,pageSize}`, mặc định 20 dòng |
| `GET /api/payments/:id` | Chi tiết khoản thu, hội viên, điều khoản gói đã chụp và người/thời gian xác nhận |
| `POST /api/payments/:id/confirm` | `{idempotencyKey,amount}` → khoản thu đã xác nhận hoặc kết quả xác nhận trước đó |
| `POST /api/payments/:id/cancel` | Hủy khoản chờ, giữ lịch sử; lặp lại trả cùng trạng thái đã hủy |

Backend sinh mã DK/GD bằng sequence PostgreSQL, kiểm tra giá hiện hành trước khi tạo đăng ký. Giá, tên, thời hạn, quyền gym và khung giờ được chụp vào đăng ký; không sửa điều khoản của kỳ đã thanh toán. Thời hạn tính theo tháng lịch, chặn ngày bắt đầu trong quá khứ, chốt ngày cuối tháng nếu cần; `endsBefore` là mốc không bao gồm.

Đăng ký lại cùng `requestId`/dữ liệu trả cùng giao dịch. Dùng mã yêu cầu với dữ liệu khác trả 409. Xác nhận lặp cùng khoản thu không tạo thêm audit hoặc thay người/ngày xác nhận. Ràng buộc số tiền, tài khoản, khóa theo hội viên và transaction bảo vệ khỏi kích hoạt một phần khi có xung đột.

Mã lỗi chính: 401 phiên không hợp lệ; 403 sai quyền; 404 hội viên/giao dịch không tồn tại; 400 ngày/phân trang/body sai; 409 `MEMBER_NOT_ELIGIBLE`, `PRICE_CHANGED`, `PACKAGE_UNAVAILABLE`, `MEMBERSHIP_OVERLAP`, `MEMBERSHIP_FROZEN`, `AMOUNT_MISMATCH`, `REQUEST_CONFLICT`, `PAYMENT_CANCELLED`, `ALREADY_CONFIRMED`, `ORDER_EXPIRED`.

## Dữ liệu và lưu trữ trình duyệt

- Migration `202611080001_sales_codes`: thêm sequence mã và index lịch sử, không xóa dữ liệu hay seed lại database đang dùng.
- Gỡ `DemoProvider`, seed hội viên/giao dịch phía web và các hàm đọc/ghi kho `fithub-web-demo-v2`. Kho cũ trong trình duyệt bị bỏ qua, không tự nhập vào database vì chưa được xác thực.
- `localStorage` chỉ còn định danh cài đặt/thiết bị và camera; `sessionStorage` giữ token đăng nhập. Đây không phải kho hồ sơ, gói hoặc giao dịch. Phiên, quyền và camera vẫn được xác thực bằng database.
- Tổng quan dùng ngày Việt Nam, không gọi số thu hôm nay là doanh thu ca trực khi chưa có mô hình ca. Giao dịch `GD-TESTQR-*` có nhãn thử nghiệm và được loại khỏi doanh thu.
- Lỗi API hiện lỗi/thử lại và giữ biểu mẫu; không quay về dữ liệu mẫu. Sau lưu đọc lại giao dịch bằng API.

## Xác minh

- `npm run db:test`: 62 ca API/database, gồm 9 ca bán gói/thu tiền mới.
- Bộ mới kiểm tra tạo chờ/QR bị chặn, xác nhận đồng thời chỉ một lần, giá thay đổi, ngày sai, tài khoản chưa xác minh/ngừng sử dụng, chống chồng kỳ, gia hạn tương lai, hủy giữ lịch sử, khóa mã xác nhận dùng cho hai hóa đơn và số tổng quan khớp database.
- Playwright kiểm tra đặt gói → thu tiền → QR hợp lệ, mất phản hồi sau commit, tải lại/xóa localStorage vẫn thấy dữ liệu, hủy/xem lịch sử, bộ lọc, lỗi mạng và màn hình nhỏ.
- Chỉ các runner có chặn URL database test được dùng để ghi dữ liệu kiểm thử; không thu tiền thử trên Supabase hiện có.

Kết quả thực thi: [DATABASE-SALES-TEST-REPORT.md](DATABASE-SALES-TEST-REPORT.md).
