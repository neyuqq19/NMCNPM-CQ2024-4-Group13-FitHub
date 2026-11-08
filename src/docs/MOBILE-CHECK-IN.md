# UC03 — Check-in QR tại quầy

## Sử dụng

1. Mobile: đăng nhập hội viên → **Check-in** (thanh điều hướng hoặc thẻ QR trên trang chủ).
2. Web: đăng nhập Admin → **Check-in** → **Bật camera**, cho phép trình duyệt dùng camera.
3. Đưa QR mobile vào khung camera. Camera dừng khi đọc được mã; kết quả chỉ hiện sau phản hồi backend.
4. Bấm **Quét tiếp** cho hội viên tiếp theo. Khi mất phản hồi, bấm **Kiểm tra lại kết quả** trước khi quét tiếp.

Đây là xác nhận quyền vào tập tại quầy, không điều khiển cổng. Hội viên chưa có gói đủ điều kiện không được cấp QR. Không cấp gói hay xác nhận thanh toán tự động.

Camera trình duyệt cần HTTPS hoặc localhost/127.0.0.1. Truy cập web bằng IP LAN qua HTTP có thể không được trình duyệt cấp camera. Mobile trên điện thoại dùng `EXPO_PUBLIC_API_URL` trỏ đến backend có thể truy cập từ điện thoại; cấu hình này không hiển thị trong giao diện.

## Quy tắc

- QR được ký HMAC và chứa TOTP chu kỳ 20 giây, không chứa access token hoặc bí mật TOTP. Hạn QR và tất cả quyết định dùng giờ server.
- Tài khoản/phiên phải còn hiệu lực. Backend đọc lại tất cả đăng ký gói và thanh toán khi quét; gói còn hạn, đã thanh toán, có quyền gym, không bảo lưu/hủy mới được xét.
- Ngày bắt đầu bao gồm; ngày kết thúc `endsBefore` không bao gồm. Giờ Việt Nam: thường `[05:30,22:00)`, thấp điểm `[09:00,16:00)`.
- Có nhiều gói phù hợp: chọn ngày kết thúc sớm nhất, sau đó UUID tăng dần. Gói mua cho tương lai không che gói đang dùng.
- Khoảng cách giữa hai lượt thành công là 10 phút trên toàn bộ camera/thiết bị. Cấp/đổi QR không bắt đầu thời gian chờ.
- Khóa giao dịch theo mã yêu cầu và tài khoản hội viên. Một giao dịch chỉ có một lượt thành công; thử lại giữ nguyên kết quả và mốc thời gian cũ.
- Đăng nhập thiết bị khác, hết phiên hoặc ngừng tài khoản khiến QR cũ không được chấp nhận. Mobile chỉ hiện thành công từ kết quả đã lưu.
- Khi chuyển nền, mobile ẩn QR và ngừng polling. Khi quay lại, đọc kết quả trước khi đổi mã; lỗi mạng có nút thử lại và không dùng QR mẫu.

## API

Các kiểu dữ liệu nằm trong `@fithub/contracts`. Mọi endpoint yêu cầu Bearer session.

| Endpoint | Quyền | Kết quả |
| --- | --- | --- |
| `POST /api/check-ins/qr` | MEMBER | `{id,payload,serverNow,expiresAt,member,membership}` |
| `GET /api/check-ins/qr/:id/status` | MEMBER sở hữu QR và phiên | `{serverNow,result}`; tìm cả thành công của mã trước trong thời gian chờ |
| `POST /api/check-ins/scanners` | ADMIN | Nhận `{deviceId,label}`, trả `{id,label}` gắn với phiên Admin |
| `POST /api/check-ins/scan` | ADMIN + camera hợp lệ | Nhận `{scannerId,requestId,payload}`, trả `CheckInResult` |
| `GET /api/check-ins/transactions/:requestId` | ADMIN của phiên camera | Tra cứu quyết định đã lưu sau mất phản hồi |

`CheckInResult` gồm `accepted`, `code`, `message`, `requestId`, `serverNow` và thông tin hội viên/gói được phép hiển thị; lượt thành công có `checkedInAt`, `retryAt`. Từ chối nghiệp vụ khi quét trả HTTP 200 với `accepted:false` và được lưu; không tạo `CheckInRecord`.

HTTP 401: phiên không hợp lệ; 403: sai vai trò/camera; 404: không tìm thấy QR/giao dịch được phép xem; 409: không đủ điều kiện cấp mã hoặc dùng lại requestId với dữ liệu khác; 400: UUID/body không hợp lệ. Mã nghiệp vụ gồm `QR_INVALID`, `QR_EXPIRED`, `MEMBER_SESSION_INVALID`, `NO_MEMBERSHIP`, `PAYMENT_PENDING`, `MEMBERSHIP_SCHEDULED`, `MEMBERSHIP_EXPIRED`, `MEMBERSHIP_FROZEN`, `MEMBERSHIP_CANCELLED`, `NO_GYM_ACCESS`, `OUTSIDE_HOURS`, `CHECKIN_COOLDOWN`.

## Cấu hình và dữ liệu

- Chạy `npm run db:generate` và `npm run db:migrate`. Hai migration mới chỉ bổ sung bảng/cột/chính sách giờ tập.
- Đặt `CHECKIN_SIGNING_SECRET` ngẫu nhiên, tối thiểu 32 ký tự, trong `backend/.env`. Không đưa vào client hoặc Git. Production bắt buộc có; các instance backend dùng cùng secret. Thay secret làm QR đang hiển thị mất hiệu lực.
- `CheckInScanner`: định danh camera gắn phiên Admin. `enabled=false` chặn quét và chặn đăng ký lại cùng định danh trong phiên đó. Quản lý thiết bị chuyên dụng chưa thuộc đợt này.
- `CheckInQr`: mã tham chiếu và hạn dùng, không lưu payload. `CheckInTransaction`: hash payload và kết quả, không lưu mã QR có thể quét. `CheckInRecord`: lượt thành công tham chiếu hội viên/gói/giao dịch.
- `Package.accessWindow` và `Membership.accessWindowSnapshot`: mặc định REGULAR cho dữ liệu cũ; trigger chụp chính sách giờ khi tạo đăng ký và ngăn sửa sau xác nhận thanh toán.
- Không ghi access token, secret hay toàn bộ QR vào log. Không lưu dữ liệu y tế vào nhật ký check-in.

Các màn hình lịch tập/biểu đồ gói chưa tích hợp vẫn ghi rõ bản xem thử. Số lượt check-in trong tháng lấy từ database; trang chủ không tự gán gói mẫu cho tài khoản chưa mua gói.

## Kiểm tra

Chạy lần lượt `npm run db:test`, `npm run test:e2e`, `npm run test:mobile` khi PostgreSQL test riêng tại cổng 55432 đang chạy (`npm run db:local`). Các runner từ chối database ngoài `localhost/127.0.0.1/fithub_test`. Không chạy các bộ dùng chung database đồng thời vì có ca đối chiếu tổng số hội viên.

Các bootstrap trong `backend/test` chỉ chạy trên database test; đồng hồ check-in E2E dịch về giờ mở cửa để kết quả không phụ thuộc giờ chạy. Production dùng đồng hồ thật và không có endpoint mô phỏng camera/OTP.
