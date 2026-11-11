# FitHub API Specification (NestJS Backend)

Các endpoint đăng ký email OTP và tóm tắt gói mobile được mô tả tại [Mobile Auth API](MOBILE-AUTH.md#api). Endpoint đăng nhập hiện tại hỗ trợ gửi lại requestId và thay phiên Member an toàn khi đăng nhập đồng thời.

## Base URL
- Local: `http://localhost:3000`
- Android Emulator: `http://10.0.2.2:3000`

---

## 1. Hệ thống & Giám sát (Health)
- **`GET /api/health`**
  - Mô tả: Kiểm tra trạng thái hoạt động của NestJS API Server và kết nối Supabase Cloud PostgreSQL.
  - Phản hồi mẫu (200 OK):
  ```json
  {
    "status": "ok",
    "database": "supabase-connected",
    "usersInDb": 7,
    "timestamp": "2026-11-07T03:00:00.000Z"
  }
  ```

---

## 2. Xác thực & Tài khoản (Auth Module)
- **`POST /api/auth/login`**
  - Body:
  ```json
  {
    "identifier": "0901234567",
    "password": "FitHubDemo!2026",
    "platform": "MOBILE",
    "deviceId": "00000000-0000-4000-8000-000000000001",
    "requestId": "00000000-0000-4000-8000-000000000002"
  }
  ```
  - Phản hồi (200 OK): Trả về thông tin `user`, `accessToken`, `expiresAt`.

- **`GET /api/auth/me`**
  - Headers: `Authorization: Bearer <token>`
  - Phản hồi: Thông tin tài khoản hiện tại kèm quyền truy cập.

---

## 3. Quản lý Hội viên (Members Module)
- **`GET /api/members`**
  - Quyền: Quản trị viên (`ADMIN`)
  - Query: `q`, `status`, `page=1`, `pageSize=20` (1–100).
  - Phản hồi: `{ items: MemberDto[], total, page, pageSize }`; trạng thái gói mới nhất độc lập trạng thái tài khoản.

- **`GET /api/memberships/my`**
  - Quyền: Hội viên (`MEMBER`)
  - Phản hồi: Tóm tắt trạng thái gói tập cá nhân, ngày bắt đầu, ngày hết hạn và quyền vào cổng gym.

---

## 4. Quản lý Gói tập (Packages Module)
- **`GET /api/packages`**
  - Phản hồi: Danh sách các gói tập đang mở bán (Gym 1 tháng, Gym 3 tháng, Gym 6 tháng, Gym 12 tháng).


## 5. UC04 — Hồ sơ hội viên (đã tích hợp)

Mọi endpoint dưới đây kiểm tra Bearer session còn hiệu lực và role ADMIN ở backend. Dùng UUID hồ sơ trong URL; `memberCode` là mã hiển thị do server cấp bằng sequence, không phải UUID tài khoản. Danh sách không trả tiền sử chấn thương, mật khẩu hoặc dữ liệu phiên.

| Endpoint | Input | Kết quả |
|---|---|---|
| GET `/api/members` | `q`, `status`, `page`, `pageSize` | `{ items, total, page, pageSize }` |
| GET `/api/members/:id` | UUID hồ sơ | `MemberDetailDto`, gồm các gói chỉ đọc |
| POST `/api/members` | `CreateMemberRequest` | 201, hồ sơ đã lưu |
| PATCH `/api/members/:id` | `UpdateMemberRequest`, bắt buộc `version` | 200, hồ sơ với version mới |
| POST `/api/members/:id/deactivate` | `{ version, reason }` | 201, hồ sơ DEACTIVATED |
| POST `/api/auth/logout` | Bearer session | 200 `{ success: true }`, token đã thu hồi |

Hợp đồng TypeScript chuẩn nằm trong `shared/src/index.ts`. Các phản hồi thành công trả dữ liệu trực tiếp, không có lớp bọc `data`.

Ví dụ tạo:

```json
{
  "displayName": "Hội viên mẫu",
  "email": "member@example.com",
  "phone": null,
  "dateOfBirth": "2000-05-20",
  "gender": "OTHER",
  "address": null,
  "heightCm": 170.5,
  "weightKg": 65,
  "injuryHistory": null
}
```

Sửa dùng cùng các trường hồ sơ kèm `version` nhưng không gửi `email`, `phone`, `existingUserId`. Trường tùy chọn không gửi trong PATCH được giữ nguyên; gửi null hoặc chuỗi rỗng để xóa giá trị. Biểu mẫu web gửi đủ các trường hiện có. Số đo dương tối đa 999,99 với tối đa 2 chữ số thập phân. Ngày sinh phải là ngày lịch hợp lệ không ở tương lai theo giờ Việt Nam. Liên hệ được chuẩn hóa email chữ thường và điện thoại `+84` thành `0`; ràng buộc duy nhất áp dụng cả tài khoản bị khóa/ngừng sử dụng.

`POST` với liên hệ của Member có hồ sơ trả 409 `MEMBER_EXISTS` kèm `memberId`; giao diện mở hồ sơ này. Member chưa có hồ sơ trả 409 `CONFIRM_EXISTING_ACCOUNT` kèm `existingUserId`; gửi lại cùng input thêm `existingUserId` sau xác nhận. Không thay họ tên/liên hệ đã có của tài khoản ở bước bổ sung này. Liên hệ mới khác tài khoản hiện có, thuộc Admin/PT hoặc thuộc hai tài khoản khác nhau bị từ chối.

Lỗi trả `{ code, message, fieldErrors?, memberId?, existingUserId?, ... }`. Các mã chính: 400 `VALIDATION_ERROR`; 401 phiên không hợp lệ; 403 `FORBIDDEN_ROLE`; 404 `MEMBER_NOT_FOUND`; 409 `CONTACT_CONFLICT`, `CONTACT_ROLE_CONFLICT`, `MEMBER_EXISTS`, `CONFIRM_EXISTING_ACCOUNT`, `VERSION_CONFLICT`, `ACCOUNT_DEACTIVATED`, `CONTACT_CHANGED`. Xung đột phiên bản yêu cầu tải lại, không ghi đè. Gửi lại ngừng sử dụng với hồ sơ đã DEACTIVATED trả hồ sơ hiện tại, không tạo nhật ký/thu hồi lần nữa.

Ngừng sử dụng ghi lý do tối đa 1000 ký tự trong AuditLog, chuyển trạng thái và thu hồi tất cả phiên trong một transaction. Không có DELETE vật lý, không đổi gói, không hoàn tiền và không giải phóng liên hệ cho tài khoản khác.


### Lịch sử mua gói trong hồ sơ hội viên

`GET /api/members/:id` bổ sung `purchaseHistory: PackagePurchaseDto[]`, sắp xếp theo ngày đăng ký mới nhất trước. Mỗi phần tử gồm các trường `MembershipSummary`, `registeredAt`, `price` (giá snapshot), `payment` (null hoặc `{ code, amount, method, status, confirmedAt }`). Lịch sử bao gồm đăng ký chờ/hủy để tra cứu, không coi các đăng ký này là đã thu tiền. Thông tin này chỉ đọc, giữ nguyên quyền ADMIN của endpoint và không dùng dữ liệu giao dịch mẫu của web.


### Tổng quan và thông tin tóm tắt hồ sơ

`GET /api/members/overview` yêu cầu ADMIN, trả `{ total, active, pendingVerification, unavailable }`. Số đếm tính trên tất cả hồ sơ hội viên, độc lập `q/status/page` của danh sách; `unavailable` là tổng tài khoản LOCKED và DEACTIVATED. Không đếm tài khoản MEMBER chưa có hồ sơ.

`MemberDetailDto` bổ sung `createdAt` (ngày tạo hồ sơ ISO) và `totalSpent` (tổng Payment.amount có trạng thái CONFIRMED của hội viên). Chưa thanh toán/hủy không góp vào số tiền; giá danh mục hiện tại không sửa ngược tổng tiền đã thu. Dữ liệu gói và hồ sơ hiện có được giữ lại khi đổi bố cục.

### UC06 — Hồ sơ chuyên môn PT

Các endpoint dưới đây yêu cầu phiên đăng nhập. UC08 dùng `id` của hồ sơ trong danh sách làm định danh PT.

| Phương thức | Đường dẫn | Dữ liệu |
| --- | --- | --- |
| GET | `/api/trainers` | Trả `{ items: TrainerSummaryDto[] }` cho Admin, PT và hội viên. Có thể kết hợp `q` (tên) và `specialty` (chuyên môn). Chỉ gồm PT đang ACTIVE có hồ sơ hoàn chỉnh. |
| GET | `/api/trainers/:id` | Chi tiết PT, gồm tiểu sử, danh sách chứng chỉ và phiên bản. |
| GET | `/api/trainers/me` | Hồ sơ của PT đang đăng nhập, kể cả khi chưa điền thông tin lần đầu. |
| PUT | `/api/trainers/me/profile` | Gửi `version`, `bio`, `specialties`, `experienceYears` và tùy chọn `avatarUrl`. |
| POST | `/api/trainers/me/certifications` | Gửi `version`, `name`, `issuer`, `issuedAt` dạng YYYY-MM-DD và tùy chọn `credentialUrl` (mã hoặc đường dẫn). |
| DELETE | `/api/trainers/me/certifications/:certId` | Gửi `{ "version": n }` trong JSON body. |

Ba thao tác ghi chỉ dành cho chính PT. Mỗi lần lưu thành công trả về toàn bộ hồ sơ với phiên bản mới. Khi gặp `409 VERSION_CONFLICT`, tải lại hồ sơ trước khi lưu tiếp. API trả `403 NOT_PROFILE_OWNER` cho người sửa sai quyền và `400` kèm `fieldErrors` khi dữ liệu không hợp lệ.
