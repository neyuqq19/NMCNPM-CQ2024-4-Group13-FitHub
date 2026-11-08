# Hướng Dẫn Kiểm Thử Phần Mềm & Thiết Kế Ca Kiểm Thử PA4 — Dự Án FitHub (Nhóm 13)

*(Tài liệu này được biên soạn bám sát **Bài giảng Kiểm thử phần mềm — Thầy Nguyễn Văn Khiết**, yêu cầu **Mục d của đề bài `PA4.pdf` (35/80 điểm)**, cùng hai tài liệu đặc tả **`rup_sad.docx (v1.5)`** và **`rup_ucspec-v2_final.docx (v1.5)`**).*

---

## 1. Tầm Quan Trọng & Yêu Cầu Chấm Điểm Mục `d` Trong PA4 (35 / 80 Điểm)

Theo đề bài `PA4.pdf`, phần **d – Kế hoạch kiểm thử và các ca kiểm thử** chiếm tới **35/80 điểm** (tỷ trọng điểm lớn nhất trong toàn bộ bài nộp PA4). Nhóm cần hoàn thành đầy đủ 3 sản phẩm kiểm thử sau:

1. **Kế hoạch kiểm thử (`Test Plan`):**
   - Trình bày đầy đủ các mục theo bài giảng Kiểm thử phần mềm (Mục tiêu V&V, Phạm vi & Đối tượng kiểm thử, 4 Cấp độ kiểm thử, Các hoạt động kiểm thử, Kỹ thuật kiểm thử, Môi trường & Công cụ).
   - Liệt kê rõ danh sách các chức năng (Use Cases) được kiểm thử trong đợt phát hành PA4.
2. **Thiết kế các ca kiểm thử (`Test Cases` — Functional Testing):**
   - Đề bài yêu cầu tối thiểu chọn **3 Use Cases**, mỗi Use Case tối thiểu **5 ca kiểm thử** ($\ge 15$ ca kiểm thử).
   - **Quy ước của Nhóm 13 để đạt điểm tuyệt đối:** Mỗi thành viên thiết kế và thực thi **tối thiểu 6 – 8 ca kiểm thử chức năng (Functional Test Cases)** cho mỗi Use Case mình phụ trách (áp dụng trực tiếp kỹ thuật **Phân vùng lớp tương đương**, **Phân tích giá trị biên**, **Kiểm thử kịch bản** và **Kiểm thử hộp xám**).
3. **Báo cáo kiểm thử (`Test Report`):**
   - Thực thi toàn bộ các ca kiểm thử đã thiết kế **ít nhất 01 lần** trên phần mềm thật.
   - Ghi nhận rõ: Danh sách Use Case đã kiểm thử, Môi trường kiểm thử (Hệ điều hành, trình duyệt, thiết bị di động, CSDL), Kết quả thực tế (`PASS` / `FAIL`), Bằng chứng kiểm thử (log lệnh test tự động / ảnh chụp màn hình) và Danh sách lỗi phát hiện được (nếu có).

---

## 2. Áp Dụng Lý Thuyết Bài Giảng "Kiểm Thử Phần Mềm" Vào Dự Án FitHub

### 2.1. Xác minh và Xác thực (Verification & Validation — V&V)

| Khái niệm (Slide 7–9) | Định nghĩa trong bài giảng | Áp dụng thực tế vào dự án FitHub (PA4) |
| :--- | :--- | :--- |
| **Xác minh (`Verification`)**<br>*(Quality Control — Kiểm soát chất lượng)* | Kiểm tra xem sản phẩm có được xây dựng **đúng theo các quy định và tài liệu thiết kế** hay không. | Đối chiếu mã nguồn (`src/backend`, `src/web-client`, `src/mobile-client`) và lược đồ `schema.prisma` phải tuân thủ 100% các quy tắc nghiệp vụ (`BR`), yêu cầu bảo mật (`SR`), tên trạng thái và biểu đồ lớp trong `rup_sad.docx (v1.5)` & `rup_ucspec-v2_final.docx (v1.5)`. |
| **Xác thực (`Validation`)**<br>*(Quality Assurance — Đảm bảo chất lượng)* | Đảm bảo phần mềm thực sự **hoạt động đúng nhu cầu người dùng** trước khi phát hành (thử nghiệm sạch / tích cực & thử nghiệm tìm lỗi). | Chạy hệ thống thật kết nối PostgreSQL, đăng nhập đúng vai trò (`ADMIN`, `TRAINER`, `MEMBER`) và thực hiện trọn vẹn các kịch bản sử dụng từ đầu đến cuối mà không bị văng lỗi hay sai lệch dữ liệu. |

> [!IMPORTANT]
> **Nguyên lý cốt lõi (Slide 9):** *"Một số lượng bài kiểm tra hữu hạn không thể xác thực rằng phần mềm hoạt động trong mọi tình huống. Ngược lại, chỉ cần một bài kiểm tra không đạt cũng đủ để chứng minh rằng phần mềm không hoạt động."* Vì vậy, mọi thành viên phải kiểm thử cả **luồng chính (Happy Path)** lẫn **các biên lỗi (Boundary / Exception Cases)**.

---

### 2.2. Bốn Cấp Độ Kiểm Thử (Testing Levels — Slide 15–24)

Trong kiến trúc Clean Monorepo của FitHub (`src/`), quá trình kiểm thử được tổ chức theo đúng 4 cấp độ từ thấp lên cao:

```text
[1. Unit Testing] ──► [2. Integration Testing (Tăng dần)] ──► [3. System & Release Testing] ──► [4. Acceptance Testing]
  (Hàm tính toán,        (Controller ↔ Service ↔ Prisma         (Requirements-based &             (Alpha testing nội bộ
   Validation,            ↔ PostgreSQL fithub_test,              Scenario Testing trên             nhóm trên Web Admin &
   Pure Functions)        tích hợp giữa các module)              Web + Mobile + Adapter)           Mobile Expo Go)
```

1. **Unit Testing (Kiểm thử đơn vị — Slide 16):**
   - Kiểm thử độc lập từng hàm logic/thuật toán cấp thấp nhất từ dưới lên (*bottom-up*), không phụ thuộc mạng hay giao diện:
     - Hàm kiểm tra định dạng dữ liệu đầu vào (`members.validation.ts`, độ mạnh mật khẩu, chuẩn mã `EQ-<NHÓM>-<STT>`);
     - Hàm tính ngày kết thúc gói theo **quy tắc tháng lịch** (`packageEnd` trong `UC05`);
     - Hàm chia khung giờ rảnh của PT thành các **ca 60 phút + 15 phút đệm nghỉ** (`generateWorkingSlots` trong `UC07`);
     - Hàm tính tổng Volume và **công thức Epley 1RM** (`calculateEpley1RM` trong `UC13`).
2. **Integration Testing (Kiểm thử tích hợp tăng dần — Slide 17–18):**
   - Áp dụng phương pháp **Tích hợp và kiểm thử tăng dần (Incremental Integration)**:
     - Tích hợp từng module Backend với cơ sở dữ liệu PostgreSQL kiểm thử (`fithub_test`), kiểm tra tương tác giữa các phân hệ:
       - `UC15 (Payment)` $\leftrightarrow$ `UC05 (grantPaidOrder)` trong cùng 1 transaction ACID;
       - `UC08 (Appointment)` $\leftrightarrow$ `UC07 (WorkingSlot)` $\leftrightarrow$ `UC05 (holdPTSession / refundPTSession)` $\leftrightarrow$ `UC16 (Reminder)`;
       - `UC03 (Check-in)` $\leftrightarrow$ `UC05 (checkGymAccess)`.
     - Mỗi khi một thành viên merge module mới vào nhánh chung, bắt buộc chạy lại bộ **Kiểm thử hồi quy (Regression Test)** để đảm bảo không làm hỏng các module đã tích hợp trước đó.
3. **System Testing & Release Testing (Kiểm thử hệ thống & phát hành — Slide 19–22):**
   - Kiểm thử hệ thống tích hợp hoàn chỉnh (bao gồm cả Web Client, Mobile Client, Backend API và các bộ tích hợp bên ngoài như `VNPayAdapter`, `InvoiceAdapter [SIMULATED]`, `PushAdapter`).
   - Sử dụng kết hợp 2 phương pháp trong bài giảng:
     - **Requirements-based testing (Kiểm thử dựa trên yêu cầu — Slide 21):** Lấy từng quy tắc `BR01..BR06`, `SR01..SR03` trong `UCSpec v1.5` ra và thiết kế bộ test case xác nhận từng quy tắc đó.
     - **Scenario testing (Kiểm thử kịch bản — Slide 22):** Xây dựng các câu chuyện sử dụng thực tế đi qua luồng chính (*Basic Flow*), luồng rẽ nhánh (*Alternative Flows `A1..An`*) và luồng ngoại lệ (*Exception Flows `E1..En`*).
4. **Acceptance Testing (Kiểm thử chấp nhận — Slide 23–24):**
   - Thực hiện **Alpha Testing** tại môi trường của nhóm phát triển: đóng vai Quản trị viên (`admin@fithub.vn`), Huấn luyện viên (`trainer@fithub.vn`) và Hội viên (`minhanh@example.com`, `hoangnam@example.com`) thao tác trực tiếp trên giao diện để nghiệm thu trước khi đóng gói nộp PA4.

---

### 2.3. Các Hoạt Động Kiểm Thử Áp Dụng Trong PA4 (Slide 25–33)

| Hoạt động kiểm thử | Mục đích (Slide 25–33) | Cách thực hiện trong dự án FitHub |
| :--- | :--- | :--- |
| **Functional Test**<br>*(Kiểm thử chức năng — Slide 28)* | Xác thực ứng dụng tuân thủ thông số kỹ thuật và thực hiện chính xác mọi chức năng (UI, API, CSDL, Bảo mật, Mạng). | Kiểm thử từng thao tác trên màn hình Web/Mobile, mã trả về HTTP (`200/201/400/401/403/404/409`), dữ liệu ghi vào bảng PostgreSQL và dòng `AuditLog`. |
| **Smoke Test**<br>*(Kiểm thử khói — Slide 33)* | Kiểm tra nhanh và đơn giản đảm bảo các chức năng chính hoạt động bình thường trước khi test sâu. | Chạy `npm run typecheck`, `npm run build`, gọi `GET /api/health` trả về `{"status":"ok","database":"up"}`, đăng nhập thử Web & Mobile thành công. |
| **Regression Test**<br>*(Kiểm thử hồi quy — Slide 25, 32)* | Chạy lại các bài kiểm tra đã vượt qua trước đó sau mỗi lần sửa đổi/thêm chức năng mới. | Chạy lệnh `npm run db:test` và `npm run test:e2e` để đảm bảo 100% các test của `UC01 -> UC04` vẫn `PASS` sau khi ghép code `UC05 -> UC16`. |
| **Compatible Test**<br>*(Kiểm thử tương thích — Slide 26)* | Đảm bảo tương thích với các trình duyệt, hệ điều hành và kích thước màn hình khác nhau. | Kiểm thử Web Admin trên Chrome / Microsoft Edge ở cả độ phân giải Desktop (`1280x800`) và Mobile Viewport (`390x844`); kiểm thử Mobile trên Expo Go / Mobile Web. |
| **Conformance Test**<br>*(Kiểm thử tính phù hợp — Slide 27)* | Xác minh tuân thủ tiêu chuẩn định dạng và giao thức. | Kiểm tra định dạng chuẩn UUID, ngày giờ ISO-8601 (`Asia/Ho_Chi_Minh`), chữ ký `HMAC-SHA512` của VNPay, mã QR TOTP 20 giây, mã thiết bị `EQ-<NHÓM>-<STT>`. |

---

## 3. Bốn Kỹ Thuật Thiết Kế Ca Kiểm Thử Bắt Buộc Áp Dụng (Slide 34–50)

Khi viết các ca kiểm thử cho Use Case của mình, mỗi thành viên cần vận dụng rõ 4 kỹ thuật trong bài giảng:

### 3.1. Kỹ thuật Kiểm thử Hộp đen (Black-box Testing — Slide 40–47)

#### A. Phân tích giá trị biên (Boundary Value Analysis — BVA, Slide 44)
- **Nguyên tắc:** Xác suất tìm thấy lỗi cao nhất nằm ở ngay ranh giới của điều kiện. Với miền giá trị hợp lệ $x_1 \le x \le x_2$, bắt buộc thiết kế các ca kiểm thử tại **6 điểm biên**:
  - Ngay dưới biên dưới: $x_1 - 1$ *(Không hợp lệ)*
  - Ngay tại biên dưới: $x_1$ *(Hợp lệ)*
  - Ngay trên biên dưới: $x_1 + 1$ *(Hợp lệ)*
  - Ngay dưới biên trên: $x_2 - 1$ *(Hợp lệ)*
  - Ngay tại biên trên: $x_2$ *(Hợp lệ)*
  - Ngay trên biên trên: $x_2 + 1$ *(Không hợp lệ)*

#### B. Phân vùng lớp tương đương (Equivalence Partitioning — EP, Slide 45–46)
- **Nguyên tắc:** Chia miền dữ liệu đầu vào thành các lớp tương đương theo 4 quy tắc ở Slide 46:
  1. **Điều kiện là một phạm vi (Range):** xác định **1 lớp hợp lệ** và **2 lớp không hợp lệ** (nhỏ hơn biên dưới, lớn hơn biên trên). *Ví dụ: Số ngày bảo lưu mỗi đợt từ `7` đến `30` ngày ➔ Lớp hợp lệ: `[7..30]`; 2 lớp không hợp lệ: `< 7` (vd `5 ngày`) và `> 30` (vd `35 ngày`).*
  2. **Điều kiện là một giá trị cụ thể:** **1 lớp hợp lệ** và **2 lớp không hợp lệ**. *Ví dụ: Mã OTP đúng 6 chữ số.*
  3. **Điều kiện là một thành viên của tập hợp (Enum/Set):** **1 lớp hợp lệ** (thuộc tập hợp) và **1 lớp không hợp lệ** (ngoài tập hợp). *Ví dụ: Loại hiệp tập `setType` thuộc `{"W", "R", "D", "F"}` vs. `"X"`.*
  4. **Điều kiện là Boolean:** **1 lớp hợp lệ (`true`)** và **1 lớp không hợp lệ (`false`)**.

#### C. Sử dụng kinh nghiệm kiểm thử (Experience-based — Slide 47)
- Với các trường chuỗi, mảng hoặc danh sách (như tìm kiếm hội viên, tiểu sử `bio`, danh sách chuyên môn `specialties`, danh sách hiệp tập `sets`):
  - Kiểm tra với **chuỗi/mảng rỗng** (độ dài `= 0`);
  - Kiểm tra với **chỉ 01 phần tử duy nhất**;
  - Kiểm tra với **kích thước khác nhau** và vượt giới hạn tối đa (ví dụ `reason > 1000 ký tự`);
  - Truy cập phần tử **đầu tiên, ở giữa và cuối cùng** của danh sách phân trang.

---

### 3.2. Kỹ thuật Kiểm thử Hộp trắng (White-box Testing — Slide 35–39)
- Sử dụng sơ đồ luồng điều khiển (**Flow Graph Notation** — *Sequence, Selection, Repetition*) của hàm Service để xác định **tập cơ sở các con đường độc lập (Basis Path)**:
  - Đảm bảo **Code Coverage**: mọi câu lệnh và mọi nhánh `if/else` (cả mặt `true` và mặt `false`) đều được thực thi ít nhất 1 lần trong Unit/API Test.
  - Ví dụ trong hàm `cancelAppointmentByPT` (`UC08`): nhánh 1 (`hoursBeforeStart >= 6` ➔ chỉ hoàn 1 buổi) và nhánh 2 (`hoursBeforeStart < 6` ➔ hoàn 1 buổi + cấp thêm 1 buổi đền bù `compensationGranted = true`).

---

### 3.3. Kỹ thuật Kiểm thử Hộp xám (Grey-box Testing — Slide 48)
- Người kiểm thử nắm rõ cấu trúc bảng PostgreSQL (`schema.prisma`), khóa lạc quan `version`, khóa chống lặp `idempotencyKey`/`requestId` và cơ chế transaction nhưng kích hoạt kiểm thử qua HTTP API hoặc giao diện người dùng:
  - Ví dụ: Mở 2 request cập nhật hồ sơ cùng `version = 0` để kiểm chứng request thứ hai trả về đúng `409 VERSION_CONFLICT` và dữ liệu DB không bị ghi đè mất mát.

---

### 3.4. Kỹ thuật Kiểm thử Dựa trên lỗi (Fault-based Testing — Slide 49–50)
- Đặt giả thuyết về **3 loại lỗi tích hợp phổ biến** (Slide 50) để viết test chứng minh:
  1. **Sử dụng sai thao tác / thông điệp:** Gửi sai định dạng DTO, dùng token của `MEMBER` gọi vào API của `ADMIN`/`TRAINER`.
  2. **Gọi không đúng thứ tự / ngữ cảnh:** Xác nhận `NO_SHOW` khi ca tập PT chưa kết thúc; nghiệm thu bảo trì cho thiết bị đang `OPERATIONAL` hoặc đã `RETIRED`; kích hoạt lại đơn thanh toán đã `CONFIRMED`.
  3. **Kết quả không mong muốn khi xảy ra lỗi bộ phận:** Giả lập `InvoiceAdapter` hoặc `PushAdapter (FCM)` bị lỗi mạng để chứng minh đơn thanh toán (`UC15`) hoặc hộp thư In-App (`UC16`) vẫn được lưu thành công mà không làm hỏng giao dịch chính.

---

## 4. Bảng Tra Cứu Giá Trị Biên (BVA) & Lớp Tương Đương (EP) Cho Từng Thành Viên (12 Use Cases PA4)

Để mọi người không phải tự mò lại tài liệu, dưới đây là các **giá trị biên và lớp tương đương chuẩn từ `SAD v1.5` & `UCSpec v1.5`** mà từng bạn bắt buộc phải đưa vào bảng Test Case của mình:

### 👤 1. Nguyễn Hữu Quyền (`24120424` — `UC01`, `UC02`, `UC03`, `UC04` — Đã có bộ test tự động làm mẫu)

| Use Case | Quy tắc nghiệp vụ (`SAD` / `UCSpec`) | Lớp tương đương Hợp lệ (Valid EP) | Lớp Không hợp lệ & Giá trị biên (BVA) cần kiểm thử |
| :---: | :--- | :--- | :--- |
| **UC01** | Mật khẩu `>= 8 ký tự` (chữ + số); OTP `6 chữ số` hạn `5 phút`; Cooldown gửi lại `60s`; Khóa khi sai `5 lần` | • Mật khẩu `8 ký tự` có chữ & số<br>• Nhập OTP đúng tại `4p59s`<br>• Gửi lại OTP tại `60s` | • Độ dài mật khẩu: `7 ký tự` (biên dưới - 1), `8 ký tự` (biên), chỉ toàn chữ hoặc toàn số<br>• Thời hạn OTP: đúng mốc `300s (5 phút)` ➔ hết hạn<br>• Cooldown: bấm gửi lại ở `59s` (bị chặn) vs `60s` (thành công)<br>• Số lần sai OTP: lần `4` (còn cho nhập) vs lần `5` (khóa tạm `15 phút`) |
| **UC02** | Sai mật khẩu `5 lần` khóa `15 phút`; `MEMBER` chỉ có `1 phiên` trên Mobile | • Đăng nhập đúng ở lần thử thứ `1..4`<br>• Đăng nhập sau khi hết `15 phút` khóa | • Sai mật khẩu lần `4` vs lần `5` (`loginLockedUntil = now + 15m`)<br>• Tài khoản `LOCKED`, `DEACTIVATED`, `PENDING_VERIFY`<br>• `MEMBER` đăng nhập trên Thiết bị B ➔ Token trên Thiết bị A bị thu hồi (`401`) |
| **UC03** | QR động TOTP `20 giây`; Anti-passback `10 phút`; Khung giờ `OFF_PEAK` (`09:00 <= t < 16:00`) | • Quét QR trong vòng `< 20s`<br>• Quét lại sau `>= 10 phút`<br>• Gói `OFF_PEAK` quét lúc `09:00` – `15:59` | • Biên hạn QR: `19s` (`ALLOWED`) vs đúng mốc `20s` (`QR_EXPIRED`)<br>• Biên Anti-passback: `9p59s` (`COOLDOWN_ACTIVE`) vs đúng `10p00s` (`ALLOWED`)<br>• Biên giờ `OFF_PEAK`: `08:59` (Từ chối), **`09:00`** (Chấp nhận), **`15:59`** (Chấp nhận), **`16:00`** (Từ chối) |
| **UC04** | Khóa lạc quan `version`; Ngừng sử dụng mềm bắt buộc có `reason` (`1..1000 ký tự`) | • `version` khớp với DB<br>• `reason` dài `1..1000 ký tự`<br>• `heightCm`, `weightKg > 0` | • Gửi `version` cũ (`version - 1`) ➔ `409 VERSION_CONFLICT`<br>• Biên `reason`: chuỗi rỗng `""` / toàn khoảng trắng (`0 ký tự`), `1 ký tự`, `1000 ký tự`, `1001 ký tự`<br>• Ngày sinh ở tương lai hoặc ngày không tồn tại (`30/02`) |

---

### 👤 2. Trịnh Văn Hợp (`24120320` — `UC05` & `UC10`)

| Use Case | Quy tắc nghiệp vụ (`SAD` / `UCSpec`) | Lớp tương đương Hợp lệ (Valid EP) | Lớp Không hợp lệ & Giá trị biên (BVA) cần kiểm thử |
| :---: | :--- | :--- | :--- |
| **UC05**<br>*(Gói tập & Bảo lưu)* | • Quy tắc tháng lịch (`BR04`)<br>• Tối đa `01` gói `SCHEDULED`<br>• Bảo lưu (`BR02`): chỉ gói `>= 6 tháng`, mỗi đợt `7..30 ngày`, tổng tích lũy `<= 30 ngày`<br>• Dịch lùi gói `SCHEDULED` (`BR03`) | • Gói `6 tháng`, `12 tháng` đang `ACTIVE`<br>• Số ngày bảo lưu: `7 ngày`..`30 ngày`<br>• Gia hạn lần 1 khi đang có gói `ACTIVE` ➔ tạo gói `SCHEDULED` | • **Biên thời hạn gói được bảo lưu:** Gói `1 tháng`, `3 tháng` (Từ chối `400`) vs Gói **`6 tháng`**, `12 tháng` (Hợp lệ)<br>• **Biên số ngày bảo lưu:** **`6 ngày`** (`< 7` ➔ Từ chối), **`7 ngày`** (Biên dưới hợp lệ), **`30 ngày`** (Biên trên hợp lệ), **`31 ngày`** (`> 30` ➔ Từ chối)<br>• **Biên cộng dồn bảo lưu:** Đợt 1 đã nghỉ `20 ngày`, Đợt 2 xin nghỉ `10 ngày` (`Tổng = 30` ➔ Hợp lệ) vs xin nghỉ `11 ngày` (`Tổng = 31` ➔ Từ chối)<br>• **Biên ngày cuối tháng (`BR04`):** `01/11/2026 + 1 tháng = 30/11/2026`; `31/01/2027 + 1 tháng = 27/02/2027`<br>• **Biên số gói `SCHEDULED`:** Gia hạn thêm gói thứ 2 khi đã có 1 gói `SCHEDULED` ➔ `409` |
| **UC10**<br>*(Thiết bị phòng tập)* | • Mã bất biến `EQ-<NHÓM>-<STT>` (`BR01`)<br>• Tối đa `01` sự cố `OPEN` mỗi máy<br>• Nghiệm thu bảo trì bắt buộc có `resolutionNote` (`BR02`)<br>• Máy `RETIRED` khóa vĩnh viễn (`BR04`) | • Nhóm hợp lệ: `CARDIO`, `STRENGTH`, `FREE_WEIGHT`, `FUNCTIONAL`<br>• Báo hỏng máy `OPERATIONAL` ➔ `OUT_OF_ORDER`<br>• Nghiệm thu máy `OUT_OF_ORDER` có `resolutionNote` ➔ `OPERATIONAL` / `RETIRED` | • Nhóm máy ngoài tập hợp (`"YOGA_MAT"`) ➔ `400`<br>• Báo hỏng lần 2 trên máy đang `OUT_OF_ORDER` (đã có 1 sự cố `OPEN`) ➔ `409 INCIDENT_ALREADY_OPEN`<br>• Nghiệm thu bảo trì với `resolutionNote = ""` (rỗng) ➔ `400 RESOLUTION_NOTE_REQUIRED`<br>• Mọi thao tác sửa/báo hỏng/nghiệm thu trên máy đã **`RETIRED`** ➔ `409 EQUIPMENT_RETIRED` |

---

### 👤 3. Trương Minh Quang (`24120415` — `UC15` & `UC08`)

| Use Case | Quy tắc nghiệp vụ (`SAD` / `UCSpec`) | Lớp tương đương Hợp lệ (Valid EP) | Lớp Không hợp lệ & Giá trị biên (BVA) cần kiểm thử |
| :---: | :--- | :--- | :--- |
| **UC15**<br>*(Thanh toán gói tập)* | • Đúng giá niêm yết (`BR02`)<br>• Kích hoạt gói trong cùng transaction (`BR01`)<br>• VNPay `vnp_Amount = amount * 100` & chữ ký `HMAC-SHA512` (`SR01`)<br>• Idempotent Callback / `idempotencyKey` (`BR04`) | • Đơn `PENDING` của hội viên `ACTIVE`<br>• Số tiền khớp 100% `payment.amount`<br>• Chữ ký VNPay hợp lệ, mã phản hồi `00` | • Số tiền gửi lên lệch `1 đồng` (`amount - 1` hoặc `amount + 1`) ➔ `409 AMOUNT_MISMATCH`<br>• Gửi lặp 2 lần cùng `idempotencyKey` / cùng Webhook VNPay ➔ lần 2 trả `200 OK` nhưng không cộng gói lần 2<br>• Xác nhận thu tiền cho đơn đã `CANCELLED` ➔ `409`<br>• Callback VNPay bị sửa `vnp_Amount` hoặc sai `vnp_SecureHash` ➔ `400 INVALID_SIGNATURE`<br>• Giả lập lỗi `InvoiceAdapter` (`E2`) ➔ đơn vẫn `CONFIRMED`, hóa đơn `FAILED` cho phép bấm phát hành lại |
| **UC08**<br>*(Đặt lịch hẹn PT 1-1)* | • Ca chuẩn `60p + 15p đệm` đang `OPEN`, `ptAvailable >= 1` (`BR01, BR02`)<br>• Hội viên hủy: mốc **`12 giờ`**<br>• PT hủy: mốc **`6 giờ`** (`< 6h` đền bù `+1 buổi`)<br>• Xác minh `NO_SHOW` sau khi ca kết thúc | • Hội viên có `ptAvailable >= 1`, chọn ca `OPEN` không trùng lịch<br>• Hội viên hủy trước `>= 12h` (hoàn 1 buổi)<br>• PT hủy trước `>= 6h` (hoàn 1 buổi) | • **Biên số buổi PT:** `ptAvailable = 0` (Chặn `400`) vs `ptAvailable = 1` (Đặt được, giảm về `0`)<br>• **Đặt trùng đồng thời (`SR02`):** 2 hội viên cùng đặt 1 `slotId` ➔ 1 người `201`, 1 người `409 SLOT_ALREADY_BOOKED`<br>• **Biên Hội viên hủy lịch (mốc 12h):** Còn **`12h00p`** (Hoàn 1 buổi PT) vs còn **`11h59p`** (Trừ hẳn 1 buổi PT)<br>• **Biên PT hủy lịch (mốc 6h):** Còn **`6h00p`** (Hoàn 1 buổi) vs còn **`5h59p`** (Hoàn 1 buổi **+ Cộng đền bù thêm 1 buổi PT**)<br>• **Biên `NO_SHOW`:** Gọi trước khi ca kết thúc (`now < endTime` ➔ Chặn `400`) vs sau khi ca kết thúc (`now >= endTime` ➔ Chuyển `NO_SHOW` + trừ 1 buổi) |

---

### 👤 4. Võ Nhật Liệu (`24120366` — `UC06` & `UC07`)

| Use Case | Quy tắc nghiệp vụ (`SAD` / `UCSpec`) | Lớp tương đương Hợp lệ (Valid EP) | Lớp Không hợp lệ & Giá trị biên (BVA) cần kiểm thử |
| :---: | :--- | :--- | :--- |
| **UC06**<br>*(Hồ sơ chuyên môn PT)* | • `bio` (`1..1000 ký tự`) & `specialties` (`>= 1 mục`) bắt buộc (`BR01`)<br>• `experienceYears >= 0` & `issuedAt <= today` (`BR02`)<br>• Chỉ chính PT sở hữu mới được sửa (`6.3.1`) | • Chính PT (`trainer@fithub.vn`) sửa hồ sơ của mình<br>• `experienceYears = 0..50`<br>• Ngày cấp chứng chỉ `<= hôm nay` | • **Biên `bio` & `specialties`:** `bio = ""` (rỗng), `bio = 1001 ký tự`, `specialties = []` (mảng rỗng) ➔ `400`<br>• **Biên `experienceYears`:** **`-1`** (Từ chối `400`), **`0`** (Biên dưới hợp lệ), `5` (Hợp lệ)<br>• **Biên ngày cấp chứng chỉ (`issuedAt`):** Hôm nay (`today` ➔ Hợp lệ) vs Ngày mai (`today + 1 ngày` ➔ Từ chối `400 FUTURE_ISSUE_DATE`)<br>• **Phân quyền sở hữu (`6.3.1`):** PT A hoặc Admin gọi API sửa hồ sơ của PT B ➔ `403 FORBIDDEN` |
| **UC07**<br>*(Lịch làm việc PT)* | • Tự động chia ca **`60 phút + 15 phút đệm`** (`BR01`)<br>• Không trùng lắp ca (`BR02`)<br>• Báo bận trước tối thiểu **`24 giờ`** và chỉ khóa ca chưa `BOOKED` (`BR03, BR04`) | • Khung giờ rảnh `>= 60 phút` trong giờ mở cửa (`06:00–22:00`)<br>• Báo bận trên ca `OPEN` còn `>= 24h` | • **Biên độ dài khung giờ đăng ký (`BR01`):**<br>  - `08:00–08:59` (**`59 phút`** `< 60p` ➔ Chặn `400 RANGE_TOO_SHORT`)<br>  - `08:00–09:00` (**`60 phút`** ➔ Tạo đúng `1 ca` `08:00–09:00`)<br>  - `08:00–10:15` (**`135 phút`** = `60 + 15 + 60` ➔ Tạo đúng `2 ca` `08:00–09:00`, `09:15–10:15`)<br>  - `08:00–12:00` (**`240 phút`** ➔ Tạo `3 ca`, bỏ qua phần dư `30 phút` cuối)<br>• **Biên thời gian báo bận (`BR03`):** Còn **`24h00p`** (Cho phép khóa sang `UNAVAILABLE`) vs còn **`23h59p`** (Chặn `400 NOTICE_TOO_LATE`)<br>• **Báo bận trên ca đã `BOOKED` (`BR04`):** Chặn `409 SLOT_ALREADY_BOOKED` |

---

### 👤 5. Nguyễn Trần Minh Trí (`24120461` — `UC13` & `UC16`)

| Use Case | Quy tắc nghiệp vụ (`SAD` / `UCSpec`) | Lớp tương đương Hợp lệ (Valid EP) | Lớp Không hợp lệ & Giá trị biên (BVA) cần kiểm thử |
| :---: | :--- | :--- | :--- |
| **UC13**<br>*(Nhật ký tập luyện)* | • Hiệp tập thuộc `{"W", "R", "D", "F"}`<br>• `totalVolume = sum(reps * weightKg)` (`BR01`)<br>• Epley 1RM chỉ tính cho hiệp **`R`** có `weightKg > 0` (`BR02, BR03`)<br>• Lần đầu lập Baseline (`isPR = false`), lần sau `1RM mới > 1RM cũ` mới `isPR = true` (`BR04`) | • Hiệp `R` với `reps >= 1`, `weightKg > 0`<br>• Hiệp `W`, `D`, `F` tính vào `totalVolume` nhưng không xét 1RM | • **Lớp tương đương loại hiệp (`setType`):** `"R"` (Tính 1RM) vs `"W"`, `"D"`, `"F"` (Không tính 1RM) vs `"X"` (`400`)<br>• **Biên số lần lặp (`reps`) trong Epley 1RM (`BR02`):**<br>  - `reps = 0` hoặc `-1` (`400`)<br>  - **`reps = 1`** với `100kg` ➔ `1RM = 100kg` (giữ nguyên)<br>  - **`reps = 2`** với `100kg` ➔ `1RM = 100 * (1 + 2/30) = 106.67kg`<br>• **Biên Kỷ lục cá nhân (`BR04`):**<br>  - Buổi 1 (chưa có kỷ lục): đạt `1RM = 100kg` ➔ Lưu Baseline, **`isPR = false`**<br>  - Buổi 2: đạt `1RM = 100kg` (bằng kỷ lục cũ) ➔ **`isPR = false`**<br>  - Buổi 3: đạt `1RM = 100.5kg` (`> 100kg`) ➔ Cập nhật kỷ lục, **`isPR = true` 🏆** |
| **UC16**<br>*(Thông báo nhắc lịch)* | • Nhắc lịch PT ở 2 mốc **`24h` & `2h`** (`BR01`)<br>• Nhắc hạn gói ở 2 mốc **`7 ngày` & `3 ngày`**, tạm dừng khi `FROZEN` (`BR02, A2`)<br>• Kiểm tra nguồn còn hiệu lực trước khi phát (`BR03`)<br>• Hộp thư In-App độc lập với FCM Push (`BR04, E1`) | • Lịch hẹn `CONFIRMED` đến mốc `24h` / `2h`<br>• Gói `ACTIVE` còn `7 ngày` / `3 ngày` | • **Kiểm tra nguồn (`BR03`):** Đến giờ phát nhắc lịch nhưng lịch hẹn PT đã chuyển sang `CANCELLED_BY_MEMBER` ➔ Chuyển Reminder sang `CANCELLED`, không sinh thông báo<br>• **Gói tập đang `FROZEN` hoặc đã có gói `SCHEDULED` (`A1, A2`):** Tạm dừng / bỏ qua nhắc hạn gói<br>• **Giả lập lỗi `PushAdapter` (`BR04, E1`):** `PushAdapter` ném lỗi kết nối ➔ `DeliveryAttempt = FAILED` nhưng bản ghi `Notification` trong Hộp thư In-App vẫn được tạo thành công (`isRead = false`) |

---

## 5. Mẫu Thiết Kế Ca Kiểm Thử Chuẩn (Test Case Template)

Mỗi thành viên sử dụng mẫu bảng chuẩn dưới đây để viết tối thiểu **5 – 8 ca kiểm thử** cho mỗi Use Case của mình (để ghép thẳng vào tài liệu nộp PA4):

```markdown
### Bảng Ca Kiểm Thử Use Case: [Mã UC] — [Tên Use Case]
- **Người thiết kế & thực thi:** [Họ và tên — MSSV]
- **Mục chiếu tài liệu:** `SAD Mục [4.x]`, `UCSpec Mục [3.x.x]`

| Mã TC | Tên ca kiểm thử & Kỹ thuật áp dụng | Điều kiện tiên quyết (Pre-conditions) | Các bước thực hiện & Dữ liệu đầu vào (Test Steps & Inputs) | Kết quả mong đợi (Expected Result) | Kết quả thực tế | Trạng thái |
| :---: | :--- | :--- | :--- | :--- | :--- | :---: |
| **TC-UC05-01** | Đăng ký gói mới hợp lệ và kiểm tra quy tắc tháng lịch *(Scenario / EP hợp lệ - BR04)* | Hội viên `HV001` đang `ACTIVE`, gói `GYM01` (`1 tháng`, `500.000đ`) đang mở bán | 1. Đăng nhập Admin (`admin@fithub.vn`)<br>2. Mở `/members/:id/package` của `HV001`<br>3. Chọn gói `GYM01`, ngày bắt đầu `2026-11-01`<br>4. Bấm `"Tiếp tục thu tiền"` | • Tạo `Membership` trạng thái `PENDING_PAYMENT` và `Payment` trạng thái `PENDING`<br>• Thời hạn hiển thị `01/11/2026 – 30/11/2026` (`endsBefore = 2026-12-01`)<br>• Lưu đúng `priceSnapshot = 500000` | Đúng như mong đợi | **PASS** |
| **TC-UC05-02** | Bảo lưu gói tập dưới 6 tháng bị từ chối *(BVA biên thời hạn gói - BR02)* | Hội viên `HV002` đang có gói `DK0000` (`GYM03` — `3 tháng`) ở trạng thái `ACTIVE` | 1. Gọi `POST /api/memberships/:id/freeze` (hoặc bấm Bảo lưu trên UI) với `days = 10`, `reason = "Đi công tác"` | • Hệ thống từ chối với mã HTTP `400 FREEZE_NOT_ELIGIBLE`<br>• Thông báo: *"Chỉ gói tập từ 6 tháng trở lên mới được bảo lưu"*<br>• Trạng thái gói giữ nguyên `ACTIVE` | Đúng như mong đợi | **PASS** |
| **TC-UC05-03** | Bảo lưu gói 6 tháng với 6 ngày bị từ chối và 7 ngày thành công *(BVA biên dưới số ngày 6 vs 7 - BR02, BR03)* | Hội viên có gói `GYM06` (`6 tháng`) đang `ACTIVE` (`endsBefore = 2027-05-01`) kèm 1 gói `SCHEDULED` kế tiếp | 1. Thử bảo lưu `6 ngày` (`2026-11-10` -> `2026-11-15`)<br>2. Thử bảo lưu `7 ngày` (`2026-11-10` -> `2026-11-16`) | • Bước 1 (`6 ngày`): Trả lỗi `400 FREEZE_MIN_7_DAYS`<br>• Bước 2 (`7 ngày`): Thành công `200 OK`, gói chuyển sang `FROZEN`, `endsBefore` cộng thêm `7 ngày`, gói `SCHEDULED` phía sau tự động dịch lùi `7 ngày` | Đúng như mong đợi | **PASS** |
```

---

## 6. Hướng Dẫn Viết & Chạy Kiểm Thử Tự Động Trong Source Code (`src/`)

Dự án FitHub đã cấu hình sẵn hệ thống kiểm thử tự động tách biệt hoàn toàn với dữ liệu demo trên Supabase (sử dụng database kiểm thử cục bộ `fithub_test` tại cổng `55432`).

### 6.1. Các lệnh chạy kiểm thử trong `src/`

Mở terminal tại thư mục `src/` và chạy:

```powershell
# 1. Smoke Test: Kiểm tra kiểu dữ liệu TypeScript và Build toàn bộ 4 workspaces
npm run typecheck
npm run build

# 2. Backend Database & API Integration Tests (Node Test Runner + Supertest)
npm run db:test

# 3. Web End-to-End (E2E) Browser Tests (Playwright trên Microsoft Edge / Chromium)
npm run test:e2e

# 4. Mobile Unit & E2E Tests
npm run test:mobile
```

### 6.2. Nơi đặt file test mới của từng thành viên

Mỗi thành viên khi viết xong API Backend và giao diện cho Use Case của mình thì tạo thêm file test tự động theo đúng mẫu đã có sẵn trong repo:

| Thành viên | Use Case | File Test Backend (tham khảo mẫu `backend/test/members.test.ts`) | File Test E2E Web / Mobile (tham khảo mẫu `web-client/tests/ui.spec.ts`) |
| :--- | :---: | :--- | :--- |
| **Nguyễn Hữu Quyền** | `UC01..UC04` | `src/backend/test/auth-registration.test.ts`<br>`src/backend/test/check-ins.test.ts`<br>`src/backend/test/members.test.ts` *(Đã xong 53/53 PASS)* | `src/web-client/tests/check-in.spec.ts`<br>`src/web-client/tests/ui.spec.ts`<br>`src/mobile-client/tests/auth.spec.ts` *(Đã xong)* |
| **Trịnh Văn Hợp** | `UC05`, `UC10` | `src/backend/test/packages-memberships.test.ts` *(mới)*<br>`src/backend/test/equipments.test.ts` *(mới)* | `src/web-client/tests/equipments.spec.ts` *(mới)* |
| **Trương Minh Quang** | `UC15`, `UC08` | `src/backend/test/sales.test.ts` *(mở rộng)*<br>`src/backend/test/pt-bookings.test.ts` *(mới)* | `src/web-client/tests/sales.spec.ts` *(mở rộng)* |
| **Võ Nhật Liệu** | `UC06`, `UC07` | `src/backend/test/trainers.test.ts` *(mới)* | `src/web-client/tests/trainers.spec.ts` *(mới)* |
| **Nguyễn Trần Minh Trí** | `UC13`, `UC16` | `src/backend/test/workouts.test.ts` *(mới)*<br>`src/backend/test/notifications.test.ts` *(mới)* | `src/mobile-client/tests/workouts-notifications.spec.ts` *(mới)* |

---

## 7. Mẫu Báo Cáo Kiểm Thử (Test Report) Khi Bàn Giao Pull Request

Khi hoàn thành mỗi Use Case, thành viên cập nhật kết quả thực thi vào báo cáo kiểm thử (tham khảo mẫu thực tế đã viết tại [UC03-TEST-REPORT.md](./UC03-TEST-REPORT.md) và [UC04-TEST-REPORT.md](./UC04-TEST-REPORT.md)) gồm 4 mục ngắn gọn:

1. **Môi trường kiểm thử (Test Environment):**
   - Hệ điều hành: Windows 11, Node.js `v22.x`, NestJS 11, Prisma `6.19.3`, PostgreSQL `fithub_test` (`127.0.0.1:55432`).
   - Trình duyệt / Thiết bị: Microsoft Edge / Google Chrome Desktop (`1280x800`), Mobile Viewport (`390x844`), Expo Go.
2. **Tổng hợp kết quả chạy lệnh kiểm thử:**
   - Số ca kiểm thử đã chạy / Số ca `PASS` / Số ca `FAIL` (`npm run typecheck`, `npm run build`, `npm run db:test`, `npm run test:e2e`).
3. **Bảng kết quả thực thi chi tiết từng Ca kiểm thử (`TC-UCxx-01` ➔ `TC-UCxx-08`):**
   - Ghi rõ đầu vào, kết quả mong đợi, kết quả thực tế và trạng thái `PASS`.
4. **Danh sách lỗi đã phát hiện và khắc phục trong quá trình kiểm thử (Defects Found & Fixed):**
   - Ghi lại 1–2 lỗi thực tế đã phát hiện được nhờ áp dụng Phân tích giá trị biên (BVA) hoặc Kiểm thử tích hợp và cách đã sửa trong code (rất được cộng điểm trong báo cáo kiểm thử PA4!).
