# FitHub — Mobile App (Android / Expo React Native)

**Cập nhật:** đăng ký email OTP thật, đăng nhập/đăng xuất và khôi phục phiên đã tích hợp. Xem [hướng dẫn xác thực mobile](../docs/MOBILE-AUTH.md) để cấu hình Resend và chạy kiểm thử. App không còn tự đăng nhập bằng dữ liệu mẫu khi API lỗi.

Ứng dụng di động dành cho Hội viên (Member) theo phạm vi cam kết PA4 và thiết kế 9 màn hình trong Figma (`FitHub Mobile · Prototype` — tông màu Volt Lime `#DDF763`, Lavender `#B8ABFA`, Pastel Lilac `#E6C9FF`, Matte Black `#141416` và thanh điều hướng 4 vòng tròn Metaball).

---

## 1. Phạm vi màn hình và trạng thái đã tích hợp

1. **`00 · Đăng nhập` (`00_LOGIN`)**:
   - Đăng nhập bằng số điện thoại hoặc email và mật khẩu.
   - Địa chỉ máy chủ cấu hình bằng `EXPO_PUBLIC_API_URL`; không có bảng cấu hình kỹ thuật trên giao diện.
   - Có liên kết đăng ký email và màn hình nhập OTP; tài khoản mẫu phải xác thực qua API thật.
2. **`01 · Trang chủ hội viên` (`01_HOME`)**:
   - Tự động hiển thị đúng 3 trạng thái gói của hội viên đang đăng nhập:
     - **Còn hạn (`ACTIVE`)**: `hoangnam@example.com` (`HV002` — Gói Gym 3 tháng).
     - **Chưa có gói (`NONE`)**: `minhanh@example.com` (`HV001` — Tài khoản đã xác minh nhưng chưa mua gói).
     - **Đã hết hạn (`EXPIRED`)**: `expired@example.com` (`HV004` — Gói đã kết thúc).
3. **`02 · Gói tập của tôi` (`02_MY_PACKAGE`)**:
   - Xem chi tiết ngày bắt đầu, ngày kết thúc, số ngày còn lại và số buổi tập trong tháng.
4. **Luồng mở rộng Check-in QR (`03` → `08`)**:
   - `03 · Mã QR check-in` (đếm ngược TOTP 20 giây tự động).
   - `04 · Check-in thành công`.
   - `05 · Gói tập hết hạn`.
   - `06 · Chưa thể check-in lại (Khóa chống quét lặp 10 phút)`.
   - `07 · Mã QR hết hiệu lực`.
   - `08 · Đang kiểm tra kết quả`.

---

## 2. Cách chạy phát triển hằng ngày

Mở PowerShell tại `D:\DoAnNMCNPM\Group13-FitHub\src`:

```powershell
# Cài đặt dependencies cho toàn monorepo (lần đầu)
npm install

# Khởi động máy chủ phát triển Mobile (Expo)
npm run dev:mobile
```

- **Chạy trên điện thoại Android thật**: Tải ứng dụng **Expo Go** trên Google Play, kết nối cùng mạng Wi-Fi với máy tính và quét mã QR trên terminal.
- **Chạy trên máy ảo Android Studio**: Nhấn phím `a` trong cửa sổ terminal Expo.

---

## 3. Cách xuất file cài đặt `.apk` cho Android để nộp PA4

### Cách 1: Build `.apk` trên Cloud bằng EAS (Khuyên dùng — không cần cài Android Studio nặng máy)
```powershell
cd D:\DoAnNMCNPM\Group13-FitHub\src\apps\mobile
npx eas-cli login
npm run apk:eas
```
Cấu hình trong `eas.json` (`profile: preview`) đã đặt sẵn `"buildType": "apk"`. Sau khi build xong, EAS trả về đường link tải trực tiếp file `.apk` về máy.

### Cách 2: Build `.apk` trực tiếp trên máy (Nếu máy đã cài Android SDK / Android Studio)
```powershell
cd D:\DoAnNMCNPM\Group13-FitHub\src\apps\mobile
npm run apk:local
```
File `.apk` sẽ xuất ra tại `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`.
