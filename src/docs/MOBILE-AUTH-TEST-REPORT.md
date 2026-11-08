# Kiểm thử mobile auth — 07/11/2026

## Phạm vi và môi trường

Backend NestJS/Prisma với PostgreSQL local `fithub_test`; mobile Expo/React Native được kiểm thử qua Expo web 390×844 trên Microsoft Edge. Kiểm thử tự động không ghi dữ liệu vào Supabase và không gửi email fixture ra ngoài.

## Backend

`npm run db:test`: **36/36 PASS**, gồm 20 ca ràng buộc DB, 8 nhóm UC04 và 8 nhóm xác thực mới.

| Nhóm | Tình huống được thực thi | Kết quả |
|---|---|---|
| UC01-01 | Dữ liệu không hợp lệ, mật khẩu không khớp; email che một phần; OTP chỉ lưu hash; chưa xác minh không đăng nhập | PASS |
| UC01-02 | Xác minh đồng thời/lặp tạo đúng một hồ sơ; sau xác minh đăng nhập được, chưa có gói | PASS |
| UC01-03 | Đăng ký đồng thời cùng email, giữ mật khẩu ban đầu, gửi lại quá sớm | PASS |
| UC01-04 | Lưu số lần sai, gửi lại không reset, sai 5 lần khóa 15 phút, hết khóa bắt đầu chu kỳ mới | PASS |
| UC01-05 | OTP hết hạn/bị thay, gửi email thất bại giữ PENDING_VERIFY | PASS |
| UC01-06 | Hồ sơ tại quầy được giữ nguyên; chỉ đặt mật khẩu còn thiếu sau OTP hợp lệ | PASS |
| UC02 retry/session | Gửi lại requestId trả token dùng được; đăng nhập đồng thời chỉ còn một phiên Member | PASS |
| UC02 lockout | 5 lần sai mật khẩu đồng thời được đếm nhất quán; mật khẩu đúng không bỏ qua khóa | PASS |

Khóa hàng bảo vệ cả phiên và trạng thái OTP. Nhập OTP sai được ghi nhận dù API trả lỗi; không rollback mất bộ đếm. OTP/password không được trả trong API hay log.

## Mobile E2E

Kết quả: **5/5 PASS**; hồi quy web UC04 **7/7 PASS**. Typecheck backend/web/mobile và build contracts/backend/web đều đạt.

Chạy `npm run test:mobile`. Backend test cổng 3102 chỉ bind loopback; Expo web cổng 8082. Mailer giả chỉ được gắn từ bootstrap test có kiểm tra tên database. Endpoint lấy mã fixture không tồn tại trong startup production.

- Đăng ký, nhập sai OTP, xác minh đúng, đăng nhập, reload còn phiên, mở hồ sơ và đăng xuất bằng giao diện; token cũ bị từ chối.
- Thiếu dữ liệu, mật khẩu ngắn, mất kết nối API: vẫn ở màn hình xác thực, không đăng nhập seed dự phòng.
- Gửi email thất bại không báo thành công; email đã xác minh không tạo tài khoản lần hai.
- Đăng nhập trên thiết bị khác, reload thiết bị cũ quay về đăng nhập.
- Hai tab Đăng nhập/Đăng ký, trạng thái lựa chọn được công bố; không còn bảng/nút cấu hình API. Mắt ở cuối mỗi ô hiện/ẩn độc lập, giữ nguyên nội dung khi nhấn; chuyển luồng xóa mật khẩu và đặt lại trạng thái ẩn. Đã kiểm tra ảnh `mobile-login-tabs.png`.

Ảnh: `mobile-client/test-results/mobile-register.png`, `mobile-otp.png`, `mobile-authenticated.png`. Thư mục này được loại khỏi Git.

## Email thật và triển khai

Migration `202611070003_email_verification` đã áp dụng trên Supabase cấu hình hiện có. Prisma Client đã sinh lại. API key chỉ ở `backend/.env`, kiểm tra được Git bỏ qua.

Một email **kiểm tra kết nối** đã được Resend chấp nhận gửi đến địa chỉ do người dùng cung cấp, HTTP 200 và có message ID. Đây không phải xác minh inbox đã nhận, và không dùng mã kiểm tra đó để kích hoạt tài khoản. OTP thật sẽ được gửi khi người dùng tự đăng ký trong ứng dụng.

Chưa có tên miền gửi: `onboarding@resend.dev` chỉ gửi được đến email chủ tài khoản Resend. Gửi cho người khác cần xác minh tên miền rồi đổi RESEND_FROM. Dữ liệu email mẫu `example.com` không nhận OTP thật.

## Giới hạn

Chưa kiểm thử trên Android/iOS vật lý; SecureStore và bàn phím native cần được thử trên thiết bị. Quên mật khẩu, SMS OTP, đổi liên hệ đăng nhập và check-in thiết bị thật chưa triển khai trong đợt này.
