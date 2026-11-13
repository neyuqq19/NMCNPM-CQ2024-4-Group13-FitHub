import type { ScreenId } from '../types';

export interface RouteConfig {
  id: ScreenId;
  title: string;
}

export const APP_ROUTES: RouteConfig[] = [
  { id: '00_LOGIN', title: 'Đăng nhập' },
  { id: '01_HOME', title: 'Trang chủ' },
  { id: '02_MY_PACKAGE', title: 'Gói tập của tôi' },
  { id: '03_QR_CODE', title: 'Mã QR Check-in' },
  { id: '04_CHECKIN_OK', title: 'Check-in thành công' },
  { id: '05_EXPIRED', title: 'Gói tập hết hạn' },
  { id: '06_COOLDOWN', title: 'Thời gian chờ check-in' },
  { id: '07_QR_EXPIRED', title: 'Mã QR hết hiệu lực' },
  { id: '08_VERIFYING', title: 'Đang xác thực' },
  { id: '09_PROFILE', title: 'Hồ sơ hội viên' },
  { id: '10_TRAINERS', title: 'Huấn luyện viên' },
];
