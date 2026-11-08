# FitHub — Database PA4

## Hiện trạng

Đã triển khai PostgreSQL local, Prisma 6.19.3, migration có kiểm tra ràng buộc, seed và kiểm thử tích hợp DB. Dữ liệu nằm ở `src/.local/postgres`, được giữ lại khi tắt/mở DB và không đưa vào Git.

Web hiện vẫn dùng dữ liệu mẫu trong localStorage. Chưa có API nối web với database; không xem đăng nhập demo trên web là xác thực với bảng User.

Phạm vi DB lần này: đăng nhập/phân quyền cơ bản, hồ sơ hội viên, danh mục gói gym, đăng ký gói, thu tiền mặt và nhật ký. QR/check-in, OTP, PT, đóng băng, AI, thanh toán online và quyền chi tiết của từng nhân viên chưa được triển khai. Enum FROZEN dành chỗ cho bước sau; chưa có bảng lịch sử đóng băng hoặc dịch vụ xử lý đóng băng.

## Chạy lần đầu

Mở PowerShell tại `D:\DoAnNMCNPM\Group13-FitHub\src`:

```powershell
npm ci
npm run db:local
```

Giữ terminal trên hoạt động. Script tạo `.env` local nếu chưa có, khởi động PostgreSQL trên `127.0.0.1:55432`, tạo hai database `fithub` và `fithub_test`. Script không ghi đè `.env` đã có. Nếu cổng bị dùng bởi một phiên DB đang chạy, dùng phiên đó; không mở thêm một cluster trên cùng cổng.

Mở terminal thứ hai tại cùng thư mục:

```powershell
npm run db:prepare
npm run db:status
npm run db:studio
```

`db:prepare` lần lượt tạo Prisma Client, áp dụng migration và seed. Studio mở tại http://localhost:5555 để xem các bảng. Nhấn Ctrl+C trong terminal chạy DB để dừng; dữ liệu không bị xóa. Những lần sau chỉ cần `db:local`; chạy `db:prepare` khi có migration mới hoặc cần bổ sung dữ liệu mẫu.

Thông số local: host `127.0.0.1`, port `55432`, database `fithub`, user `fithub`, password `fithub_local_only`. Đây là thông số phát triển local, không dùng để cấu hình môi trường công khai.

## Các bảng và quan hệ

| Bảng | Vai trò | Khóa và liên kết chính |
|---|---|---|
| User | Tài khoản, vai trò, trạng thái, băm mật khẩu, bộ đếm sai đăng nhập | UUID; email/phone duy nhất; một User có nhiều Session/AuthEvent |
| Session | Phiên đăng nhập theo nền tảng/thiết bị, hạn dùng, thời điểm thu hồi | userId → User; tokenHash và requestId duy nhất |
| AuthEvent | Kết quả đăng nhập và lý do từ chối | userId → User (có thể null khi chưa tìm được tài khoản); không lưu mật khẩu/token |
| MemberProfile | Mã hội viên, ngày sinh, giới tính, địa chỉ, thông tin thể chất | userId → User, duy nhất; memberCode duy nhất; một User Member có tối đa một hồ sơ |
| Package | Danh mục gói đang bán | code duy nhất; giá VNĐ, số tháng, quyền gym, trạng thái bán |
| Membership | Một lần đăng ký gói của một hội viên | memberId → MemberProfile; packageId → Package; code và requestId duy nhất |
| Payment | Khoản thu tiền mặt cho đăng ký | membershipId → Membership, duy nhất; người xác nhận → User; code/idempotencyKey duy nhất |
| AuditLog | Người thao tác, hành động, đối tượng và tên trường đổi | actorId → User; entityType/entityId dùng để tra nhật ký, không phải FK đa hình |

User 1–0..1 MemberProfile; MemberProfile 1–N Membership; Package 1–N Membership; Membership 1–0..1 Payment. PA4 chỉ thu đủ tiền một lần cho mỗi đăng ký; chưa hỗ trợ chia đợt thu, hoàn tiền hoặc nhiều lần thử thanh toán online.

`id` UUID dùng cho liên kết; `memberCode`, `code` dùng hiển thị. API cần sinh mã hiển thị an toàn khi đồng thời, không dùng `count + 1`. Email chuẩn hóa chữ thường, số điện thoại chuẩn hóa về dạng Việt Nam `0xxxxxxxxx` trước khi lưu; giá trị chưa có dùng `null`, không dùng chuỗi rỗng.

## Trạng thái và ngày tháng

- User: `PENDING_VERIFY`, `ACTIVE`, `LOCKED`, `DEACTIVATED`. Tài khoản tạo tại quầy có thể chưa có passwordHash và verifiedAt. ACTIVE yêu cầu cả hai; không tự cấp gói chỉ vì tài khoản ACTIVE.
- Membership: `PENDING_PAYMENT` → `ACTIVE` hoặc `SCHEDULED` sau xác nhận; có `FROZEN`, `EXPIRED`, `CANCELLED` cho các bước tiếp theo. Trạng thái lưu không thay thế kiểm tra ngày hiệu lực ở API.
- Payment: `PENDING`, `CONFIRMED`, `CANCELLED`; hiện chỉ `CASH`. CONFIRMED phải có người thu và thời điểm xác nhận.
- `startsOn` và `endsBefore` là DATE theo ngày lịch phòng gym. `startsOn` được tính vào kỳ, `endsBefore` không được tính. Gói 1 tháng từ 06/11/2026 có `endsBefore = 06/12/2026`; UI hiển thị hạn cuối 05/12/2026.
- `durationMonths` là tháng lịch. Mốc kết thúc là ngày bắt đầu cộng N tháng, chặn về ngày cuối tháng đích nếu ngày tương ứng không tồn tại. Không thay bằng N × 30 ngày.
- Mốc sự kiện như createdAt/confirmedAt là TIMESTAMPTZ, hiển thị theo `Asia/Ho_Chi_Minh`. DATE không được chuyển múi giờ như một thời điểm trước khi hiển thị.
- Giá lưu Decimal(12,0) VNĐ, không dùng float. Membership lưu snapshot tên, giá, số tháng và quyền gym để sửa danh mục không sửa ngược điều khoản đã mua.

## DB đang bảo vệ những gì

- Liên hệ bắt buộc và duy nhất; ACTIVE có xác minh và mật khẩu băm; hồ sơ chỉ gắn vào Member.
- Thời lượng gói 1/3/6/12 tháng; giá dương; khoảng ngày hợp lệ; version không âm.
- Đăng ký và thanh toán có khóa chống tạo trùng; một đăng ký có tối đa một khoản thu.
- Gói đã trả tiền phải có Payment CONFIRMED; số tiền phải khớp snapshot. Điều kiện này được kiểm tra ở cuối transaction, vì vậy hai cập nhật phải nằm trong cùng transaction.
- Xác nhận tiền mặt mới yêu cầu người thu là Admin đang hoạt động và hội viên đã xác minh, đang hoạt động.
- Khoản thu đã xác nhận không được xóa/sửa nội dung; điều khoản đã mua không bị sửa ngược. Gia hạn phải tạo đăng ký mới.
- Version hỗ trợ chống ghi đè hồ sơ: API cập nhật với `where: { id, version: versionDaDoc }`, tăng version, trả lỗi xung đột nếu số dòng cập nhật là 0.

Các CHECK/trigger nằm trong migration `202611060002_integrity`. Không dùng `prisma db push` thay cho migrate vì schema.prisma không mô tả đầy đủ các ràng buộc này.

## Phần backend phải tiếp tục làm

DB không tự biết danh tính người gửi HTTP. API phải xác thực phiên, phân quyền, lấy actor từ phiên thay vì request body, lọc dữ liệu theo chủ sở hữu và kiểm tra thời gian thực.

- Tạo tài khoản + hồ sơ + nhật ký trong cùng transaction; ngừng sử dụng bằng DEACTIVATED, bảo toàn lịch sử.
- Khi xác nhận thu: khóa/kiểm tra lại tài khoản và đăng ký, đối chiếu số tiền, xác nhận Payment và đổi Membership trong một transaction, thêm AuditLog. Thứ tự khóa thống nhất để tránh deadlock.
- Tra idempotencyKey/requestId khi retry. UNIQUE ngăn bản ghi trùng, nhưng API phải trả kết quả đã lưu thay vì báo lỗi chung. Lỗi mạng sau commit không có nghĩa khoản thu thất bại.
- Khi đổi thiết bị Member: khóa dòng User, tạo phiên mới và thu hồi phiên cũ cùng transaction; mọi request tiếp theo kiểm tra thu hồi. Schema Session chưa tự thực hiện quy tắc một thiết bị.
- Kiểm tra ngày sinh, giá danh mục/khung giờ, gói tương lai, kỳ gia hạn và giới hạn đóng băng ở nghiệp vụ tương ứng. `endsBefore` còn được phép điều chỉnh cho nghiệp vụ đóng băng sau này, nhưng phải có lịch sử và quyền ở API.
- Đồng bộ trạng thái SCHEDULED/ACTIVE/EXPIRED và kiểm tra ngày trực tiếp khi sử dụng quyền; không dựa hoàn toàn vào enum.
- Quyền Admin hiện là mức vai trò rộng. Phân quyền chi tiết cho lễ tân/quản lý sẽ bổ sung trước khi mở các chức năng ngoài phạm vi PA4.

## Dữ liệu seed

| Tài khoản | Trạng thái | Mục đích |
|---|---|---|
| admin@fithub.vn | Admin ACTIVE | Quản trị và thu tiền |
| trainer@fithub.vn | Trainer ACTIVE | Kiểm tra vai trò |
| minhanh@example.com — HV001 | Member ACTIVE, chưa có gói | Luồng đăng ký/thu tiền chính |
| hoangnam@example.com — HV002 | Member ACTIVE, gói 3 tháng | Xem gói đang hoạt động |
| thuha@example.com — HV003 | PENDING_VERIFY, chưa đặt mật khẩu | Hồ sơ tại quầy chưa xác minh |
| expired@example.com — HV004 | Member ACTIVE, gói hết hạn | Phân biệt trạng thái tài khoản/gói |
| locked@example.com — HV005 | LOCKED | Từ chối tài khoản bị khóa |

Mật khẩu mẫu cho tài khoản đã thiết lập mật khẩu lấy từ `SEED_PASSWORD` trong `.env` (mặc định local `FitHubDemo!2026`). Seed dùng scrypt có salt riêng, không lưu mật khẩu rõ. Chạy seed lại chỉ bổ sung bản ghi thiếu, không reset hồ sơ, giá, giao dịch hay mật khẩu đã có.

Ngày mẫu bám prototype tháng 11/2026; không tự kéo dài gói theo ngày chạy seed. Các gói 3/6/12 tháng có giá minh họa, cần nhóm chốt trước khi dùng nghiệp vụ thật.

## Kiểm thử và bàn giao

```powershell
npm run db:test
```

Lệnh chỉ chấp nhận database local tên `fithub_test`, áp dụng migration rồi chạy test bằng PostgreSQL thật. Các fixture được rollback, không ảnh hưởng DB demo `fithub`. Bộ test DB không thay thế test plan 3 use case theo mẫu Moodle; sau khi có API cần chạy tiếp kiểm thử chức năng xuyên suốt.

Quyền phụ trách schema/migration/seed. Liệu dùng User/MemberProfile; Hợp dùng Package/Membership; Quang dùng Payment và transaction xác nhận; Trí dùng dữ liệu test và sau này gọi API mobile. Thay đổi schema mới phải tạo migration mới, không sửa migration đã áp dụng.

Khi nhóm tạo Supabase, cấu hình URL backend và URL migration riêng phù hợp project, rà soát quyền DB/RLS/schema được công khai, rồi áp dụng migration có kiểm soát. Lần này chưa tạo project hoặc kết nối Supabase.

Tham khảo triển khai: [Prisma 6 custom migrations](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/customizing-migrations), [PostgreSQL deferred constraint triggers](https://www.postgresql.org/docs/18/sql-createtrigger.html).
