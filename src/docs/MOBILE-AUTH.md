# Mobile — đăng ký email OTP và đăng nhập

Luồng hiện tại: đăng ký email → OTP → kích hoạt → đăng nhập → trang chủ. Backend và tài khoản dùng chung với web. Đã bỏ đăng nhập dự phòng bằng seed khi API lỗi.

## Chạy

Từ thư mục `src`:

```powershell
npm ci
npm run db:generate
npm run db:migrate
npm run dev:api
# Terminal khác:
npm run dev:mobile
```

Android emulator gọi `http://10.0.2.2:3000`; Expo web gọi `http://127.0.0.1:3000`. Điện thoại thật dùng IP LAN máy backend qua `EXPO_PUBLIC_API_URL` trong `mobile-client/.env` (xem `.env.example`). Khởi động lại Expo sau khi đổi biến môi trường. Sau khi thêm SecureStore/Crypto, development build riêng cần build native lại. Dùng HTTPS khi triển khai ngoài môi trường phát triển.

Tại `mobile-client`, xem bản web bằng:

```powershell
node ../node_modules/expo/bin/cli start --web --port 8081 --localhost
```

## Cấu hình email ở backend

Trong `backend/.env` được loại khỏi Git:

```dotenv
RESEND_API_KEY=<API key riêng>
RESEND_FROM="FitHub <onboarding@resend.dev>"
OTP_HASH_SECRET=
```

`OTP_HASH_SECRET` tùy chọn: secret ngẫu nhiên tối thiểu 32 ký tự; nếu để trống dùng `SESSION_SECRET`. Không đặt khóa bí mật trong `EXPO_PUBLIC_*` hoặc `VITE_*`.

Chưa có tên miền, `onboarding@resend.dev` chỉ gửi đến email tạo tài khoản Resend. Để gửi đến email bất kỳ, xác minh tên miền và đổi `RESEND_FROM` sang địa chỉ thuộc tên miền đó. Email `example.com` trong dữ liệu mẫu không nhận thư thật. Xem [giới hạn miền thử nghiệm](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain) và [Send Email API](https://resend.com/docs/api-reference/emails/send-email).

## Hành vi

- Mật khẩu đăng ký ít nhất 8 ký tự, gồm chữ và số. Email được chuẩn hóa; họ tên không bắt buộc.
- OTP 6 số, hạn 5 phút; gửi lại sau 60 giây, thay mã cũ; sai 5 lần khóa 15 phút. Gửi lại không bỏ qua giới hạn nhập sai.
- Chỉ báo đã gửi sau khi Resend tiếp nhận. Gửi lỗi vẫn giữ tài khoản PENDING_VERIFY và cho thử lại.
- Xác minh kích hoạt tài khoản và bổ sung đúng một hồ sơ nếu thiếu; không cấp gói. Tài khoản tạo tại quầy giữ hồ sơ cũ, chỉ đặt mật khẩu còn thiếu sau OTP hợp lệ. Đăng ký lại không ghi đè mật khẩu đã có.
- Đăng nhập nhận số điện thoại/email và chỉ mở giao diện hội viên khi có session thật. Tài khoản chưa mua gói/hết hạn gói vẫn được đăng nhập nếu ACTIVE.
- Native lưu session bằng Expo SecureStore; Expo web dùng sessionStorage. Giao diện có hai lựa chọn Đăng nhập/Đăng ký; mỗi ô mật khẩu có nút mắt hiện/ẩn riêng. Mỗi thiết bị có UUID riêng. Khởi động lại/foreground kiểm tra lại phiên; đăng xuất thu hồi phiên backend. Một Member chỉ có một phiên hoạt động.
- Quên mật khẩu hướng dẫn liên hệ lễ tân, chưa triển khai reset mật khẩu trong đợt này. QR/check-in và nội dung tập luyện ngoài phạm vi xác thực vẫn là prototype.

## API

| Endpoint | Input | Output |
|---|---|---|
| POST `/api/auth/register` | email, password, confirmPassword, displayName? | verificationId, emailMasked, expiresAt, resendAt, deliveryStatus |
| POST `/api/auth/resend-email-otp` | verificationId | challenge cập nhật |
| POST `/api/auth/verify-email` | verificationId, code, password?, confirmPassword? | verified, message |
| GET `/api/auth/membership` | Bearer token | tóm tắt gói theo phiên |

Ở bước verify, password/confirmPassword dùng cho tài khoản tại quầy chưa có mật khẩu. Trường hợp đã có mật khẩu thì không thay đổi mật khẩu đó. OTP lưu HMAC trong database; không trả mã qua API hoặc log. `deliveryStatus=SENT` nghĩa nhà cung cấp chấp nhận gửi, không bảo đảm đã đến inbox.

Các mã lỗi chính: 400 OTP_INVALID/OTP_EXPIRED/OTP_USED/PASSWORD_MISMATCH; 409 EMAIL_ALREADY_REGISTERED; 429 OTP_LOCKED/OTP_RESEND_TOO_SOON có `retryAt`; 503 EMAIL_DELIVERY_FAILED kèm challenge `verification`. Endpoint đăng ký/resend/verify giới hạn 20 request/IP/phút; login 60 request/IP/phút và khóa theo tài khoản sau 5 lần sai.

Gửi lại cùng requestId/deviceId cho một lần đăng nhập trả token còn dùng được; requestId hết hạn/bị thu hồi/xung đột trả 409 LOGIN_REQUEST_CONFLICT. Token chỉ lưu hash trong DB; khóa hàng đảm bảo việc thay phiên đồng thời nhất quán.

## Kiểm thử

Giữ `npm run db:local` ở terminal riêng; tại `src` chạy:

```powershell
npm run typecheck
npm run db:test
npm run test:mobile
npm run test:e2e
```

`test:mobile` dùng Expo web cổng 8082 và backend test 3102, database local `fithub_test`. Mailer giả chỉ được gắn trong bootstrap kiểm thử. Endpoint đọc OTP fixture chỉ nằm trong `backend/test/mobile-server.ts`, bind loopback và từ chối database khác; không có trong startup production. Bộ test không gửi email fixture ra ngoài. Thư mục test-results được loại khỏi Git.

Chưa kiểm thử tự động trên Android/iOS thật; Expo web không thay thế kiểm tra bàn phím và SecureStore trên điện thoại.
