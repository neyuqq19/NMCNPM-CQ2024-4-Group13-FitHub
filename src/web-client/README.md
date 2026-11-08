# FitHub — Web Admin

React + TypeScript, giữ bố cục sidebar xanh đậm, nền sáng và nút teal hiện có. Chạy từ thư mục `src` theo [hướng dẫn chung](../README.md).

## UC04 đã tích hợp API

- Đăng nhập bằng tài khoản server; kiểm tra `/api/auth/me` khi tải lại, xử lý phiên hết hạn và thu hồi phiên khi đăng xuất. Token lưu theo tab bằng sessionStorage; không mặc định tự đăng nhập Admin.
- Tìm kiếm tự cập nhật khi gõ (debounce 350 ms, hỗ trợ IME), theo tên có/không dấu, mã, số điện thoại/email; lọc trạng thái, phân trang 20 dòng/trang ở server. URL giữ tiêu chí tìm kiếm. Mỗi dòng có nút mắt để xem chi tiết/lịch sử và nút bút để mở chỉnh sửa riêng.
- Xem hồ sơ đầy đủ, tách trạng thái tài khoản/xác minh/gói. Gói chỉ đọc; ngày hết hạn hiển thị là ngày trước `endsBefore`. Lịch sử mua gói hiển thị từng đăng ký, giá snapshot, thời hạn và khoản thanh toán thật, phân biệt đã thu/chờ/hủy.
- Tạo khách mới, chuyển sang hồ sơ có sẵn hoặc xác nhận bổ sung hồ sơ vào tài khoản Member đã có. Không tự gộp tài khoản, xác minh, đặt mật khẩu hay cấp gói.
- Sửa họ tên, ngày sinh, giới tính, địa chỉ, chiều cao/cân nặng và tiền sử chấn thương. Số điện thoại/email chỉ đọc; lỗi giữ dữ liệu đã nhập; xung đột phiên bản có nút tải lại.
- Ngừng sử dụng cần lý do/xác nhận, hiển thị các gói còn hiệu lực; hủy không lưu. Thành công chuyển tài khoản DEACTIVATED, thu hồi phiên và giữ lịch sử. Hồ sơ ngừng sử dụng chỉ được xem.

## Phần xem thử

Tổng quan và các màn hình đăng ký gói/thu tiền/giao dịch vẫn dùng dữ liệu mẫu trong trình duyệt, có thông báo phân biệt. Dữ liệu đó không được sử dụng làm nguồn cho UC04. Liên kết nghiệp vụ gói không xuất hiện trên hồ sơ thật.

## Kiểm thử

Từ `src`: `npm run typecheck`, `npm run build`, `npm run db:test`, `npm run test:e2e`.
Playwright chạy API/database thật ở môi trường test riêng; dùng chặn request chỉ trong kịch bản mô phỏng mất kết nối. Kịch bản gồm tạo/sửa/ngừng sử dụng, tải lại, lỗi dữ liệu và trùng liên hệ, tìm/lọc, xung đột phiên bản, phiên hết hạn, phân trang và màn hình 390px. Xem [báo cáo UC04](../docs/UC04-TEST-REPORT.md).


Danh sách và hồ sơ có tổng quan số hội viên từ API `/api/members/overview`, độc lập bộ lọc/phân trang. Chi tiết dùng avatar chữ cái, thông tin hai cột, nhãn trạng thái, tổng tiền mua gói đã xác nhận, ngày tạo hồ sơ và lịch sử trong cùng thẻ. Bố cục thu về một cột trên điện thoại.
