import React, { useEffect, useState } from "react";
import Feather from "@expo/vector-icons/Feather";
import {
  ActivityIndicator,
  AppState,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";
import {
  DEFAULT_API_BASE_URL,
  MobileApiError,
  logoutMobile,
  restoreMobileSession,
  refreshMyMembership,
  setSessionExpiredHandler,
} from "./src/api";
import { clearSession, loadSession, saveSession } from "./src/session";
import { HomePanel } from "./src/HomePanel";
import { PtBookingPanel } from "./src/PtBookingPanel";
import { CheckInPanel } from "./src/CheckInPanel";
import { AuthPanel } from "./src/AuthPanel";
import { SPORTS_IMAGES } from "./src/sportsImages";
import { C } from "./src/theme";
import type { MobileSession, ScreenId } from "./src/types";

// --- CÁC THÀNH PHẦN ĐỒ HỌA DÙNG CHUNG KHỚP 100% VỚI 9 MÀN HÌNH TRONG HI.ZIP ---

function FourDotsHeader({
  title,
  onPressDots,
}: {
  title: string;
  onPressDots?: () => void;
}) {
  return (
    <View style={styles.fourDotsHeader}>
      <Text style={styles.fourDotsTitle}>{title}</Text>
      {onPressDots ? (
        <Pressable
          style={styles.fourDotsBtn}
          onPress={onPressDots}
          hitSlop={10}
        >
          <View style={styles.fourDotsGrid}>
            <View style={styles.dot5} />
            <View style={styles.dot5} />
            <View style={styles.dot5} />
            <View style={styles.dot5} />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

function TopoAndAthleteDecoration({
  imageUri,
  side,
}: {
  imageUri?: string | null;
  side: "left" | "right";
}) {
  const sizes = [110, 148, 186];
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {sizes.map((sz, i) => {
        const posStyle =
          side === "left"
            ? { left: -30 - i * 14, bottom: -35 - i * 10 }
            : { right: -35 - i * 12, bottom: -35 - i * 10 };
        return (
          <View
            key={i}
            style={[
              styles.topoRing,
              { width: sz, height: sz, borderRadius: sz / 2 },
              posStyle,
            ]}
          />
        );
      })}
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={[
            styles.athletePortrait,
            side === "left" ? { left: 12 } : { right: 10 },
          ]}
          resizeMode="cover"
        />
      ) : null}
    </View>
  );
}

function WhiteCircleBadge({
  bigText,
  smallText,
}: {
  bigText: string;
  smallText: string;
}) {
  return (
    <View style={styles.whiteCircleBadge}>
      <Text style={styles.whiteBadgeBig}>{bigText}</Text>
      <Text style={styles.whiteBadgeSmall}>{smallText}</Text>
    </View>
  );
}

function BlackMetricPill({
  mainVal,
  subVal,
  accentHex,
}: {
  mainVal: string;
  subVal: string;
  accentHex?: string;
}) {
  return (
    <View style={styles.blackMetricPill}>
      <Text style={styles.blackPillMain}>{mainVal}</Text>
      <Text style={[styles.blackPillSub, { color: accentHex || C.lime }]}>
        {subVal}
      </Text>
    </View>
  );
}

function FilterTrack({
  labels,
  activeIdx,
  onSelect,
}: {
  labels: [string, string, string];
  activeIdx: number;
  onSelect: (index: number) => void;
}) {
  return (
    <View style={styles.filterTrack}>
      {labels.map((label, i) => {
        const isAct = i === activeIdx;
        return (
          <Pressable
            key={label}
            style={[styles.filterPill, isAct && styles.filterPillActive]}
            onPress={() => onSelect(i)}
          >
            <Text
              style={[
                styles.filterPillText,
                isAct && styles.filterPillTextActive,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function WeekCalendarStrip() {
  const dows = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
  const doms = ["04", "05", "06", "07", "08", "09", "10"];
  return (
    <View style={styles.weekStrip}>
      {dows.map((dow, i) => {
        const isWed = i === 2;
        return (
          <View key={dow} style={styles.weekDayCol}>
            <Text style={[styles.weekDowText, isWed && { color: C.white }]}>
              {dow}
            </Text>
            <View
              style={[
                styles.weekDomCircle,
                isWed && { backgroundColor: C.lime },
              ]}
            >
              <Text style={[styles.weekDomText, isWed && { color: C.ink }]}>
                {doms[i]}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function FullBleedWorkoutLayout({
  imageUri,
  topTitle,
  topSub,
  rightBadgeText,
  meterBig,
  meterSub,
  onPressRightBadge,
  children,
}: {
  imageUri: string;
  topTitle: string;
  topSub: string;
  rightBadgeText?: string;
  meterBig?: string;
  meterSub?: string;
  onPressRightBadge?: () => void;
  children: React.ReactNode;
}) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const { height } = useWindowDimensions();
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setKeyboardOpen(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardOpen(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return (
    <KeyboardAvoidingView
      style={styles.fullBleedRoot}
      enabled={Platform.OS === "ios"}
      behavior="padding"
    >
      <View
        style={[
          styles.photoBackdropWrap,
          { height: keyboardOpen ? 100 : Math.min(430, height * 0.46) },
        ]}
      >
        <Image
          source={{ uri: imageUri }}
          style={styles.photoBackdropImage}
          resizeMode="cover"
        />
        <View style={styles.photoDarkOverlay} />

        <View style={[styles.bleedTopRow, keyboardOpen && { marginTop: 12 }]}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.bleedTopTitle}>{topTitle}</Text>
            <Text style={styles.bleedTopSub}>{topSub}</Text>
          </View>
          {rightBadgeText && (
            <Pressable style={styles.topCircleBtn} onPress={onPressRightBadge}>
              <Text style={styles.topCircleBtnText}>{rightBadgeText}</Text>
            </Pressable>
          )}
        </View>

        {meterBig && meterSub && (
          <View style={styles.bleedRightMeterCol}>
            <Text style={styles.bleedMeterBig}>{meterBig}</Text>
            <Text style={styles.bleedMeterSub}>{meterSub}</Text>
            <View style={styles.vMeterPill}>
              {[0, 1, 2, 3, 4].map((m) => {
                const barHex =
                  m === 0 ? "#E4E0FA" : m === 4 ? C.limeDeep : C.lavenderDeep;
                return (
                  <View
                    key={m}
                    style={[styles.vMeterBar, { backgroundColor: barHex }]}
                  />
                );
              })}
            </View>
          </View>
        )}
      </View>

      <View style={styles.whiteBottomSheet}>
        <View style={styles.sheetDragHandle} />
        {children}
      </View>
    </KeyboardAvoidingView>
  );
}

function MetaballBottomDock({
  activeIndex,
  onSelectTab,
}: {
  activeIndex: number;
  onSelectTab: (idx: number) => void;
}) {
  return (
    <View style={styles.dockContainer}>
      <View style={styles.dockWrap}>
        {[0, 1, 2, 3].map((i) => {
          const isActive = i === activeIndex;
          return (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={
                ["Trang chủ", "Tiến độ", "Mã QR", "Cá nhân"][i]
              }
              style={[
                styles.dockCircle,
                { backgroundColor: isActive ? C.lavender : "#ECECF2" },
              ]}
              onPress={() => onSelectTab(i)}
            >
              {i === 0 && <View style={styles.glyphHomeSquare} />}
              {i === 1 && (
                <View style={styles.glyphBarsRow}>
                  <View style={[styles.glyphBar, { height: 10 }]} />
                  <View style={[styles.glyphBar, { height: 17 }]} />
                  <View style={[styles.glyphBar, { height: 13 }]} />
                </View>
              )}
              {i === 2 && (
                <View style={styles.glyphQrWrap}>
                  <View style={styles.glyphQrRow}>
                    <View style={styles.glyphQrCorner}>
                      <View style={styles.glyphQrDot} />
                    </View>
                    <View style={styles.glyphQrCorner}>
                      <View style={styles.glyphQrDot} />
                    </View>
                  </View>
                  <View style={styles.glyphQrRow}>
                    <View style={styles.glyphQrCorner}>
                      <View style={styles.glyphQrDot} />
                    </View>
                    <View style={styles.glyphQrPattern}>
                      <View style={styles.glyphQrPixel} />
                      <View style={styles.glyphQrPixel} />
                      <View style={styles.glyphQrPixel} />
                    </View>
                  </View>
                </View>
              )}
              {i === 3 && (
                <View style={styles.glyphProfileWrap}>
                  <View style={styles.glyphProfileHead} />
                  <View style={styles.glyphProfileShoulders} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// --- ỨNG DỤNG CHÍNH ---

export default function App() {
  const [progressRequest, setProgressRequest] = useState(0);
  const [screen, setScreen] = useState<ScreenId>("00_LOGIN");
  const [apiBaseUrl, setApiBaseUrl] = useState<string>(DEFAULT_API_BASE_URL);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [session, setSession] = useState<MobileSession | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [restoreError, setRestoreError] = useState("");
  async function restore() {
    setInitializing(true);
    setRestoreError("");
    try {
      const stored = await loadSession();
      if (stored) {
        // The current app configuration is authoritative. A restored session
        // must not pin this device to the machine's previous Wi-Fi address.
        setApiBaseUrl(DEFAULT_API_BASE_URL);
        const current = await restoreMobileSession(
          DEFAULT_API_BASE_URL,
          stored.accessToken,
        );
        await saveSession(DEFAULT_API_BASE_URL, {
          ...current,
          expiresAt: stored.expiresAt,
        });
        setSession({ ...current, expiresAt: stored.expiresAt });
        setScreen("01_HOME");
      }
    } catch (e) {
      if (e instanceof MobileApiError && e.status === 401) {
        await clearSession();
        setSession(null);
        setScreen("00_LOGIN");
      } else
        setRestoreError(
          e instanceof Error ? e.message : "Không thể khôi phục phiên.",
        );
    } finally {
      setInitializing(false);
    }
  }
  useEffect(() => {
    void restore();
    setSessionExpiredHandler(() => {
      void clearSession();
      setSession(null);
      setScreen("00_LOGIN");
      setErrorMsg(
        "Phiên đã hết hạn hoặc đăng nhập trên thiết bị khác. Vui lòng đăng nhập lại.",
      );
    });
    return () => setSessionExpiredHandler(() => {});
  }, []);
  useEffect(() => {
    if (!session) return;
    let live = true;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active")
        void restoreMobileSession(apiBaseUrl, session.accessToken)
          .then((current) => {
            if (live) setSession({ ...current, expiresAt: session.expiresAt });
          })
          .catch((e) => {
            if (live)
              setErrorMsg(
                e instanceof Error ? e.message : "Không thể kiểm tra phiên.",
              );
          });
    });
    return () => {
      live = false;
      subscription.remove();
    };
  }, [session?.accessToken, apiBaseUrl]);
  async function authenticated(next: MobileSession) {
    await saveSession(apiBaseUrl, next);
    setSession(next);
    setErrorMsg(null);
    setScreen("01_HOME");
  }
  async function logout() {
    if (!session || loading) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      await logoutMobile(apiBaseUrl, session.accessToken);
      await clearSession();
      setSession(null);
      setScreen("00_LOGIN");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Chưa thể đăng xuất.");
    } finally {
      setLoading(false);
    }
  }

  function handleBottomDockSelect(tabIdx: number) {
    if (tabIdx === 0) {
      setScreen("01_HOME");
    } else if (tabIdx === 1) {
      setProgressRequest((v) => v + 1);
      setScreen("01_HOME");
    } else if (tabIdx === 2) {
      setScreen("03_QR_CODE");
    } else if (tabIdx === 3) {
      setScreen("09_PROFILE");
    }
  }

  const firstNameUpper = session?.user.displayName
    ? session.user.displayName.split(" ").slice(-2).join(" ").toUpperCase()
    : "MINH ANH";

  const shortDisplayName = session?.user.displayName || "Nguyễn Minh Anh";

  if (initializing || restoreError)
    return (
      <SafeAreaProvider>
        <SafeAreaView
          style={[styles.safeArea, { justifyContent: "center", padding: 24 }]}
        >
          {initializing ? (
            <ActivityIndicator color={C.lime} />
          ) : (
            <>
              <Text style={{ color: C.white, marginBottom: 16 }}>
                {restoreError}
              </Text>
              <Pressable
                style={styles.limePillButton}
                onPress={() => void restore()}
              >
                <Text style={styles.limePillButtonText}>Thử lại</Text>
              </Pressable>
              <Pressable
                style={styles.limePillButton}
                onPress={() => {
                  void clearSession();
                  setRestoreError("");
                  setSession(null);
                  setScreen("00_LOGIN");
                }}
              >
                <Text style={styles.limePillButtonText}>Về đăng nhập</Text>
              </Pressable>
            </>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    );
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        {errorMsg ? (
          <View style={{ backgroundColor: C.white, padding: 12 }}>
            <Text accessibilityRole="alert" style={{ color: "#b42318" }}>
              {errorMsg}
            </Text>
          </View>
        ) : null}

        {/* =====================================================================
          00 · ĐĂNG NHẬP
         ===================================================================== */}
        {screen === "00_LOGIN" && (
          <FullBleedWorkoutLayout
            imageUri={SPORTS_IMAGES.loginFull}
            topTitle="FitHub"
            topSub="Tập luyện mỗi ngày"
          >
            <AuthPanel baseUrl={apiBaseUrl} onAuthenticated={authenticated} />
          </FullBleedWorkoutLayout>
        )}

        {/* =====================================================================
          01 · TRANG CHỦ HỘI VIÊN
         ===================================================================== */}
        {screen === "01_HOME" && (
          <HomePanel
            session={session!}
            baseUrl={apiBaseUrl}
            progressRequest={progressRequest}
            onNavigate={setScreen}
          />
        )}
        {screen === "10_TRAINERS" && session && (
          <PtBookingPanel
            baseUrl={apiBaseUrl}
            token={session.accessToken}
            onBack={() => setScreen("01_HOME")}
          />
        )}

        {/* =====================================================================
          02 · GÓI TẬP CỦA TÔI
         ===================================================================== */}
        {screen === "02_MY_PACKAGE" && (
          <View style={styles.darkScreenRoot}>
            <ScrollView
              contentContainerStyle={styles.darkScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={{ color: C.mutedOnDark, marginBottom: 16 }}>
                Bản xem thử: lịch tập và biểu đồ gói tập là dữ liệu minh họa.
                Quyền check-in được kiểm tra trực tiếp trên hệ thống.
              </Text>
              <FourDotsHeader
                title="Gói tập của tôi"
                onPressDots={() => setScreen("05_EXPIRED")}
              />

              <View style={styles.monthRow}>
                <Text style={styles.monthTitle}>Tháng 11, 2026</Text>
                <Pressable
                  style={styles.arrowsPill}
                  onPress={() => {
                    setScreen("03_QR_CODE");
                  }}
                >
                  <Text style={styles.arrowsPillText}>‹ ›</Text>
                </Pressable>
              </View>

              <WeekCalendarStrip />

              {/* Banner Lime: Lịch tập hôm nay */}
              <Pressable
                style={styles.limeBanner126}
                onPress={() => {
                  setScreen("03_QR_CODE");
                }}
              >
                <TopoAndAthleteDecoration
                  imageUri={SPORTS_IMAGES.runnerCard}
                  side="right"
                />
                <Text style={styles.limeBannerTitle}>Lịch tập hôm nay</Text>
                <Text style={styles.limeBannerSub}>
                  Hoàn thành buổi tập trước 21:00
                </Text>
                <View style={styles.openQrBlackPill}>
                  <Text style={styles.openQrBlackPillText}>
                    Mở thẻ QR vào tập
                  </Text>
                </View>
              </Pressable>

              <FilterTrack
                labels={["Tổng quan", "Vào cổng", "Gia hạn"]}
                activeIdx={0}
                onSelect={(idx) => {
                  if (idx === 1) {
                    setScreen("03_QR_CODE");
                  } else if (idx === 2) {
                    setScreen("05_EXPIRED");
                  }
                }}
              />

              {/* 2 Mini Cards */}
              <View style={styles.twoColGrid}>
                <View
                  style={[styles.miniCard144, { backgroundColor: C.lilac }]}
                >
                  <TopoAndAthleteDecoration side="right" />
                  <Text style={styles.miniCardTitle}>Buổi đã tập</Text>
                  <Text style={styles.miniCardBigNum}>12</Text>
                  <Text style={styles.miniCardFoot}>Buổi trong tháng</Text>
                </View>

                <View
                  style={[styles.miniCard144, { backgroundColor: C.lavender }]}
                >
                  <TopoAndAthleteDecoration side="right" />
                  <Text style={styles.miniCardTitle}>Mục tiêu gói</Text>
                  <Text style={styles.miniCardBodyText}>
                    {"Duy trì đều đặn\nmỗi tuần để đạt kết quả."}
                  </Text>
                  <View style={styles.goal96Pill}>
                    <Text style={styles.goal96Text}>96%</Text>
                  </View>
                </View>
              </View>

              {/* Donut Card */}
              <View style={styles.donutCard190}>
                <View style={{ flex: 1, justifyContent: "space-between" }}>
                  {[
                    {
                      dot: C.lime,
                      title: "30 Ngày",
                      sub: "Tổng hạn gói Gym 1 tháng",
                    },
                    {
                      dot: C.lavender,
                      title: "01 Ngày",
                      sub: "Đã tập từ 06/11/2026",
                    },
                    {
                      dot: C.lilac,
                      title: "29 Ngày",
                      sub: "Còn lại đến 05/12/2026",
                    },
                  ].map((item) => (
                    <View key={item.title} style={styles.donutLegendRow}>
                      <View
                        style={[
                          styles.donutLegendDot,
                          { backgroundColor: item.dot },
                        ]}
                      />
                      <View>
                        <Text style={styles.donutLegendTitle}>
                          {item.title}
                        </Text>
                        <Text style={styles.donutLegendSub}>{item.sub}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                {/* Biểu đồ vòng tròn Donut */}
                <View style={styles.donutOuterRing}>
                  <View style={styles.donutTopLeftHalf} />
                  <View style={styles.donutBottomRightHalf} />
                  <View style={styles.donutInnerHole} />
                </View>
              </View>
            </ScrollView>

            <MetaballBottomDock
              activeIndex={1}
              onSelectTab={handleBottomDockSelect}
            />
          </View>
        )}

        {(
          [
            "03_QR_CODE",
            "04_CHECKIN_OK",
            "06_COOLDOWN",
            "07_QR_EXPIRED",
            "08_VERIFYING",
          ] as ScreenId[]
        ).includes(screen) &&
          session && (
            <View style={{ flex: 1 }}>
              <CheckInPanel
                key={session.accessToken}
                baseUrl={apiBaseUrl}
                token={session.accessToken}
                onAccepted={() => {
                  void refreshMyMembership(apiBaseUrl, session)
                    .then((membership) =>
                      setSession((current) =>
                        current ? { ...current, membership } : current,
                      ),
                    )
                    .catch((e) =>
                      setErrorMsg(
                        e instanceof Error
                          ? e.message
                          : "Không thể cập nhật số buổi tập.",
                      ),
                    );
                }}
                onHome={() => setScreen("01_HOME")}
              />
              <MetaballBottomDock
                activeIndex={2}
                onSelectTab={handleBottomDockSelect}
              />
            </View>
          )}

        {/* =====================================================================
          05 · GÓI TẬP HẾT HẠN
         ===================================================================== */}
        {screen === "05_EXPIRED" && (
          <View style={styles.darkScreenRoot}>
            <ScrollView
              contentContainerStyle={styles.darkScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={{ color: C.mutedOnDark, marginBottom: 16 }}>
                Bản xem thử: lịch tập và biểu đồ gói tập là dữ liệu minh họa.
                Quyền check-in được kiểm tra trực tiếp trên hệ thống.
              </Text>
              <FourDotsHeader
                title="Gói tập của tôi"
                onPressDots={() => setScreen("02_MY_PACKAGE")}
              />

              <View style={[styles.heroCard188, { backgroundColor: C.coral }]}>
                <TopoAndAthleteDecoration
                  imageUri={SPORTS_IMAGES.runnerCard}
                  side="right"
                />
                <WhiteCircleBadge bigText="0" smallText="ngày" />
                <Text style={[styles.heroCardSubLabel, { color: C.ink }]}>
                  Trạng thái hội viên
                </Text>
                <Text style={styles.heroCardMainTitle}>Gói tập đã hết hạn</Text>
                <Text style={[styles.heroCardMeta, { color: C.ink }]}>
                  Gói Gym 1 tháng kết thúc ngày 05/11
                </Text>
                <View style={styles.heroPillAnchor188}>
                  <BlackMetricPill
                    mainVal="05/11"
                    subVal="ĐÃ KẾT THÚC"
                    accentHex={C.coral}
                  />
                </View>
              </View>

              <View style={styles.twoColGrid}>
                <View
                  style={[styles.miniCard134, { backgroundColor: C.lilac }]}
                >
                  <Text style={styles.miniCardTitle}>Gói vừa dùng</Text>
                  <Text style={styles.miniCardBigNum24}>Gym 1T</Text>
                  <Text style={styles.miniCardFoot}>500.000đ / 30 ngày</Text>
                </View>

                <View
                  style={[styles.miniCard134, { backgroundColor: C.lavender }]}
                >
                  <Text style={styles.miniCardTitle}>Tổng buổi tập</Text>
                  <Text style={styles.miniCardBigNum24}>24 Buổi</Text>
                  <Text style={styles.miniCardFoot}>Hoàn thành chu kỳ</Text>
                </View>
              </View>

              <View style={styles.infoDarkCard136}>
                <Text style={styles.guideCoralHeading}>
                  Gia hạn trực tiếp tại quầy lễ tân
                </Text>
                <Text style={styles.guideBodyText}>
                  Vui lòng gặp nhân viên lễ tân để gia hạn gói tập mới. Thẻ vào
                  phòng tập sẽ tự động kích hoạt lại ngay sau khi thanh toán.
                </Text>
              </View>

              <Pressable
                style={[styles.limePillButton, { backgroundColor: C.lavender }]}
                onPress={() => setScreen("01_HOME")}
              >
                <Text style={styles.limePillButtonText}>Về trang chủ</Text>
              </Pressable>
            </ScrollView>

            <MetaballBottomDock
              activeIndex={1}
              onSelectTab={handleBottomDockSelect}
            />
          </View>
        )}

        {/* =====================================================================
          09 · HỒ SƠ HỘI VIÊN (USER PROFILE)
         ===================================================================== */}
        {screen === "09_PROFILE" && (
          <View style={styles.darkScreenRoot}>
            <ScrollView
              contentContainerStyle={[
                styles.darkScrollContent,
                { paddingBottom: 110 },
              ]}
              showsVerticalScrollIndicator={false}
            >
              <FourDotsHeader title="Hồ sơ hội viên" />
              {/* Thẻ đại diện hội viên */}
              <View style={styles.profileHeroCard}>
                <View
                  style={styles.profileAvatarLargeWrap}
                  accessible
                  accessibilityLabel="Ảnh đại diện mặc định"
                >
                  <Feather
                    name="user"
                    size={44}
                    color={C.white}
                    accessible={false}
                  />
                  <View style={styles.profileOnlineBadge} />
                </View>

                <Text style={styles.profileName}>
                  {session?.user.displayName || "Nguyễn Minh Anh"}
                </Text>

                <View style={styles.profileCodePill}>
                  <Text style={styles.profileCodeText}>
                    MÃ HỘI VIÊN: {session?.membership.memberCode || "HV001"}
                  </Text>
                </View>

                <Text style={styles.profileSubRole}>
                  Hội viên chính thức FitHub
                </Text>
              </View>

              {/* Thông tin gói tập đang sử dụng */}
              <View style={styles.profileSectionCard}>
                <View style={styles.profileSectionHeaderRow}>
                  <Text style={styles.profileSectionTitle}>
                    Gói tập hiện tại
                  </Text>
                  <View
                    style={[
                      styles.profileStatusBadge,
                      {
                        backgroundColor:
                          session?.membership.state === "ACTIVE"
                            ? C.lime
                            : session?.membership.state === "EXPIRED"
                              ? C.coral
                              : "#32323E",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.profileStatusBadgeText,
                        {
                          color:
                            session?.membership.state === "ACTIVE"
                              ? C.ink
                              : C.white,
                        },
                      ]}
                    >
                      {session?.membership.state === "ACTIVE"
                        ? "ĐANG HIỆU LỰC"
                        : session?.membership.state === "EXPIRED"
                          ? "HẾT HẠN"
                          : "CHƯA ĐĂNG KÝ"}
                    </Text>
                  </View>
                </View>

                <View style={styles.profileDivider} />

                <View style={styles.profileInfoRow}>
                  <Text style={styles.profileInfoLabel}>Tên gói tập</Text>
                  <Text style={styles.profileInfoValue}>
                    {session?.membership.packageName || "Chưa đăng ký"}
                  </Text>
                </View>

                {session?.membership.startsOn && (
                  <View style={styles.profileInfoRow}>
                    <Text style={styles.profileInfoLabel}>Ngày bắt đầu</Text>
                    <Text style={styles.profileInfoValue}>
                      {session.membership.startsOn}
                    </Text>
                  </View>
                )}

                {session?.membership.endsInclusive && (
                  <View style={styles.profileInfoRow}>
                    <Text style={styles.profileInfoLabel}>Hạn sử dụng</Text>
                    <Text style={styles.profileInfoValue}>
                      {session.membership.endsInclusive}
                    </Text>
                  </View>
                )}

                {session?.membership.daysRemaining !== undefined && (
                  <View style={styles.profileInfoRow}>
                    <Text style={styles.profileInfoLabel}>
                      Thời gian còn lại
                    </Text>
                    <Text
                      style={[
                        styles.profileInfoValue,
                        {
                          color:
                            (session.membership.daysRemaining || 0) > 0
                              ? C.lime
                              : C.coral,
                          fontWeight: "700",
                        },
                      ]}
                    >
                      {session.membership.daysRemaining > 0
                        ? `${session.membership.daysRemaining} ngày`
                        : "0 ngày (Hết hạn)"}
                    </Text>
                  </View>
                )}

                <View style={styles.profileInfoRow}>
                  <Text style={styles.profileInfoLabel}>
                    Số buổi trong tháng
                  </Text>
                  <Text style={styles.profileInfoValue}>
                    {session?.membership.sessionsThisMonth || 0} buổi
                  </Text>
                </View>

                <View style={styles.profileInfoRow}>
                  <Text style={styles.profileInfoLabel}>Khung giờ tập</Text>
                  <Text style={styles.profileInfoValue}>
                    {session?.membership.allowedHoursLabel || "Toàn khung giờ"}
                  </Text>
                </View>

                {session?.membership.state === "EXPIRED" && (
                  <Pressable
                    style={[styles.limePillButton, { marginTop: 14 }]}
                    onPress={() => setScreen("05_EXPIRED")}
                  >
                    <Text style={styles.limePillButtonText}>Gia hạn ngay</Text>
                  </Pressable>
                )}
              </View>

              {/* Thông tin tài khoản & Bảo mật (RUP SAD UC01) */}
              <View style={styles.profileSectionCard}>
                <Text style={styles.profileSectionTitle}>
                  Tài khoản & Bảo mật
                </Text>
                <View style={styles.profileDivider} />

                <View style={styles.profileInfoRow}>
                  <Text style={styles.profileInfoLabel}>Email</Text>
                  <Text style={styles.profileInfoValue}>
                    {session?.user.email || "Chưa cung cấp"}
                  </Text>
                </View>

                <View style={styles.profileInfoRow}>
                  <Text style={styles.profileInfoLabel}>Số điện thoại</Text>
                  <Text style={styles.profileInfoValue}>
                    {session?.user.phone || "Chưa cung cấp"}
                  </Text>
                </View>
              </View>

              {/* Nút thao tác Đăng xuất */}
              <Pressable
                style={styles.profileLogoutButton}
                accessibilityRole="button"
                accessibilityLabel="Đăng xuất khỏi thiết bị"
                disabled={loading}
                onPress={() => void logout()}
              >
                <Text style={styles.profileLogoutText}>
                  Đăng xuất khỏi thiết bị
                </Text>
              </Pressable>
            </ScrollView>

            <MetaballBottomDock
              activeIndex={3}
              onSelectTab={handleBottomDockSelect}
            />
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.phoneBg,
  },
  darkScreenRoot: {
    flex: 1,
    backgroundColor: C.phoneBg,
  },
  darkScrollContent: {
    paddingHorizontal: 22,
    paddingTop: 44,
    paddingBottom: 108,
  },
  fourDotsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  fourDotsTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: C.white,
  },
  fourDotsBtn: {
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  fourDotsGrid: {
    width: 16,
    height: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignContent: "space-between",
  },
  dot5: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: C.white,
  },
  topoRing: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.26)",
  },
  athletePortrait: {
    position: "absolute",
    bottom: -4,
    width: 98,
    height: 118,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.35)",
  },
  whiteCircleBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.white,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  whiteBadgeBig: {
    fontSize: 13,
    fontWeight: "700",
    color: C.ink,
  },
  whiteBadgeSmall: {
    fontSize: 9,
    fontWeight: "600",
    color: C.inkSoft,
  },
  blackMetricPill: {
    width: 116,
    height: 44,
    borderRadius: 999,
    backgroundColor: C.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  blackPillMain: {
    fontSize: 15,
    fontWeight: "700",
    color: C.white,
  },
  blackPillSub: {
    fontSize: 8.5,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  fullBleedRoot: {
    flex: 1,
    backgroundColor: C.phoneBg,
  },
  photoBackdropWrap: {
    height: 430,
    width: "100%",
    backgroundColor: "#1C1E24",
    position: "relative",
  },
  photoBackdropImage: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
  },
  photoDarkOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15,15,20,0.32)",
  },
  bleedTopRow: {
    marginTop: 48,
    paddingHorizontal: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  bleedTopTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: C.white,
  },
  bleedTopSub: {
    fontSize: 12,
    fontWeight: "500",
    color: "#E4E4EE",
    marginTop: 4,
  },
  topCircleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.white,
    alignItems: "center",
    justifyContent: "center",
    elevation: 5,
  },
  topCircleBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: C.ink,
  },
  bleedRightMeterCol: {
    position: "absolute",
    right: 22,
    top: 114,
    alignItems: "flex-end",
  },
  bleedMeterBig: {
    fontSize: 18,
    fontWeight: "700",
    color: C.white,
  },
  bleedMeterSub: {
    fontSize: 11,
    fontWeight: "500",
    color: "#E4E4EE",
    marginTop: 2,
    marginBottom: 10,
  },
  vMeterPill: {
    width: 38,
    height: 92,
    borderRadius: 999,
    backgroundColor: C.white,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    elevation: 6,
  },
  vMeterBar: {
    width: 22,
    height: 6,
    borderRadius: 3,
  },
  whiteBottomSheet: {
    flex: 1,
    marginTop: -28,
    backgroundColor: C.white,
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
    paddingHorizontal: 22,
    paddingTop: 12,
  },
  sheetDragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D0D0DA",
    alignSelf: "center",
    marginBottom: 14,
  },
  loginTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sheetHeading: {
    fontSize: 22,
    fontWeight: "700",
    color: C.ink,
  },
  forgotPwdText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6E5DCF",
  },
  loginInputBox: {
    height: 62,
    borderRadius: 18,
    backgroundColor: C.softGray,
    borderWidth: 1.5,
    borderColor: "#E0E0EA",
    paddingHorizontal: 16,
    justifyContent: "center",
    marginBottom: 12,
  },
  loginInputLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#767686",
  },
  loginInputValue: {
    fontSize: 15,
    fontWeight: "700",
    color: C.ink,
    paddingVertical: 2,
  },
  loginErrorText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#E0485C",
    marginBottom: 8,
  },
  limePillButton: {
    height: 54,
    borderRadius: 999,
    backgroundColor: C.lime,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    elevation: 4,
  },
  limePillButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: C.ink,
  },
  loginFooterNote: {
    fontSize: 11.5,
    fontWeight: "500",
    color: "#848494",
    textAlign: "center",
    marginTop: 16,
  },
  homeTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },
  avatarWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: C.lime,
    overflow: "hidden",
    backgroundColor: "#2A2A34",
    alignItems: "center",
    justifyContent: "center",
  },
  hiMemberTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: C.white,
  },
  hiMemberSub: {
    fontSize: 12,
    fontWeight: "500",
    color: "#B8B8C6",
    marginTop: 2,
  },
  bellBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#25252E",
    borderWidth: 1,
    borderColor: "#363644",
    alignItems: "center",
    justifyContent: "center",
  },
  heroCard166: {
    height: 166,
    borderRadius: 28,
    padding: 18,
    overflow: "hidden",
    position: "relative",
    marginBottom: 16,
  },
  heroCard188: {
    height: 188,
    borderRadius: 28,
    padding: 18,
    overflow: "hidden",
    position: "relative",
    marginBottom: 16,
  },
  pctRingBadge: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.35)",
    borderWidth: 2,
    borderColor: C.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  pctRingText: {
    fontSize: 11,
    fontWeight: "700",
    color: C.ink,
  },
  heroCardSubLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: C.inkSoft,
  },
  heroCardMainTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: C.ink,
    marginTop: 2,
  },
  heroCardMeta: {
    fontSize: 12,
    fontWeight: "600",
    color: C.inkSoft,
    marginTop: 4,
  },
  heroPillAnchor: {
    position: "absolute",
    left: 18,
    bottom: 18,
  },
  heroPillAnchor188: {
    position: "absolute",
    left: 18,
    bottom: 22,
  },
  sectionTitle18: {
    fontSize: 18,
    fontWeight: "700",
    color: C.white,
    marginBottom: 12,
  },
  filterTrack: {
    height: 40,
    borderRadius: 999,
    backgroundColor: "#1B1B20",
    borderWidth: 1,
    borderColor: C.strokeDark,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    marginBottom: 14,
  },
  filterPill: {
    flex: 1,
    height: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  filterPillActive: {
    backgroundColor: C.white,
  },
  filterPillText: {
    fontSize: 11.5,
    fontWeight: "500",
    color: C.mutedOnDark,
  },
  filterPillTextActive: {
    fontSize: 11.5,
    fontWeight: "700",
    color: C.ink,
  },
  card174: {
    height: 174,
    borderRadius: 28,
    padding: 18,
    overflow: "hidden",
    position: "relative",
    marginBottom: 14,
    justifyContent: "space-between",
  },
  card174Title: {
    fontSize: 19,
    fontWeight: "700",
    color: C.ink,
  },
  card174RightBottom: {
    alignSelf: "flex-end",
    alignItems: "flex-end",
  },
  translucentTag: {
    paddingHorizontal: 14,
    height: 24,
    borderRadius: 999,
    backgroundColor: "rgba(20,20,22,0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  translucentTagText: {
    fontSize: 10,
    fontWeight: "700",
    color: C.ink,
  },
  card174RightDesc: {
    fontSize: 12,
    fontWeight: "700",
    color: C.ink,
    textAlign: "right",
    lineHeight: 17,
  },
  monthRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#E4E4EE",
  },
  arrowsPill: {
    width: 64,
    height: 30,
    borderRadius: 999,
    backgroundColor: C.white,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowsPillText: {
    fontSize: 14,
    fontWeight: "700",
    color: C.ink,
  },
  weekStrip: {
    height: 62,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  weekDayCol: {
    width: 44,
    alignItems: "center",
  },
  weekDowText: {
    fontSize: 11,
    fontWeight: "600",
    color: C.mutedOnDark,
    marginBottom: 6,
  },
  weekDomCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  weekDomText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#E2E2EC",
  },
  limeBanner126: {
    height: 126,
    borderRadius: 26,
    backgroundColor: C.lime,
    padding: 18,
    overflow: "hidden",
    position: "relative",
    marginBottom: 14,
  },
  limeBannerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: C.ink,
  },
  limeBannerSub: {
    fontSize: 12,
    fontWeight: "600",
    color: C.inkSoft,
    marginTop: 4,
  },
  openQrBlackPill: {
    marginTop: 12,
    width: 148,
    height: 32,
    borderRadius: 999,
    backgroundColor: C.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  openQrBlackPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: C.lime,
  },
  twoColGrid: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 14,
  },
  miniCard144: {
    flex: 1,
    height: 144,
    borderRadius: 24,
    padding: 16,
    overflow: "hidden",
    position: "relative",
    justifyContent: "space-between",
  },
  miniCard134: {
    flex: 1,
    height: 134,
    borderRadius: 24,
    padding: 16,
    overflow: "hidden",
    position: "relative",
    justifyContent: "space-between",
  },
  miniCardTitle: {
    fontSize: 14.5,
    fontWeight: "700",
    color: C.ink,
  },
  miniCardBigNum: {
    fontSize: 28,
    fontWeight: "700",
    color: C.ink,
  },
  miniCardBigNum26: {
    fontSize: 26,
    fontWeight: "700",
    color: C.ink,
  },
  miniCardBigNum24: {
    fontSize: 24,
    fontWeight: "700",
    color: C.ink,
  },
  miniCardFoot: {
    fontSize: 11,
    fontWeight: "600",
    color: C.inkSoft,
  },
  miniCardBodyText: {
    fontSize: 11,
    fontWeight: "600",
    color: C.inkSoft,
    lineHeight: 15,
  },
  goal96Pill: {
    alignSelf: "flex-end",
    width: 64,
    height: 30,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  goal96Text: {
    fontSize: 12,
    fontWeight: "700",
    color: C.ink,
  },
  donutCard190: {
    height: 190,
    borderRadius: 26,
    backgroundColor: "#1B1B22",
    borderWidth: 1,
    borderColor: "#2D2D38",
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  donutLegendRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  donutLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  donutLegendTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: C.white,
  },
  donutLegendSub: {
    fontSize: 11,
    color: C.mutedOnDark,
    marginTop: 1,
  },
  donutOuterRing: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: C.lavender,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  donutTopLeftHalf: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 66,
    height: 112,
    backgroundColor: C.lime,
  },
  donutBottomRightHalf: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 66,
    height: 70,
    backgroundColor: C.lavender,
  },
  donutInnerHole: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#1B1B22",
  },
  qrHeaderStatsRow: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  qrCenterTimerWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  qrCountdownLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#848494",
    marginBottom: 2,
    textAlign: "center",
  },
  qrCenterTimerBox: {
    paddingHorizontal: 20,
    alignItems: "center",
  },
  qrCenterTimerText: {
    fontSize: 34,
    fontWeight: "700",
    color: C.ink,
  },
  qrBox: {
    width: 164,
    height: 164,
    borderRadius: 24,
    backgroundColor: C.ink,
    padding: 14,
    justifyContent: "center",
    alignItems: "center",
    elevation: 6,
  },
  qrGrid: {
    width: 136,
    height: 136,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 3,
  },
  qrCell: {
    width: 17,
    height: 17,
    borderRadius: 3,
  },
  qrHintCaption: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6E6E7C",
    textAlign: "center",
    marginTop: 10,
    marginBottom: 10,
  },
  softGrayRefreshBtn: {
    height: 46,
    borderRadius: 999,
    backgroundColor: C.softGray,
    alignItems: "center",
    justifyContent: "center",
  },
  softGrayRefreshText: {
    fontSize: 13,
    fontWeight: "700",
    color: C.ink,
  },
  infoDarkCard136: {
    minHeight: 136,
    borderRadius: 26,
    backgroundColor: "#1B1B22",
    borderWidth: 1,
    borderColor: "#2E2E38",
    padding: 20,
    justifyContent: "center",
    gap: 10,
    marginBottom: 18,
  },
  infoBulletWhite: {
    fontSize: 13,
    fontWeight: "600",
    color: C.white,
  },
  guideCoralHeading: {
    fontSize: 14,
    fontWeight: "700",
    color: C.coral,
  },
  guideBodyText: {
    fontSize: 12.5,
    color: "#E2E2EC",
    lineHeight: 18,
  },
  darkSecondaryPillBtn: {
    height: 50,
    borderRadius: 999,
    backgroundColor: "#24242E",
    borderWidth: 1,
    borderColor: "#383846",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  darkSecondaryPillText: {
    fontSize: 13,
    fontWeight: "700",
    color: C.white,
  },
  dockContainer: {
    position: "absolute",
    bottom: 16,
    left: 22,
    right: 22,
    alignItems: "center",
  },
  dockWrap: {
    width: 346,
    height: 62,
    borderRadius: 999,
    backgroundColor: C.white,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },
  dockCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  glyphHomeSquare: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: C.ink,
  },
  glyphBarsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    height: 17,
  },
  glyphBar: {
    width: 3,
    borderRadius: 1.5,
    backgroundColor: C.ink,
  },
  glyphQrWrap: {
    width: 20,
    height: 20,
    justifyContent: "space-between",
  },
  glyphQrRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 20,
    height: 9,
  },
  glyphQrCorner: {
    width: 9,
    height: 9,
    borderWidth: 1.8,
    borderColor: C.ink,
    borderRadius: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  glyphQrDot: {
    width: 2.5,
    height: 2.5,
    backgroundColor: C.ink,
    borderRadius: 0.5,
  },
  glyphQrPattern: {
    width: 9,
    height: 9,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  glyphQrPixel: {
    width: 3,
    height: 3,
    backgroundColor: C.ink,
    borderRadius: 0.5,
  },
  glyphProfileWrap: {
    alignItems: "center",
    gap: 3,
  },
  glyphProfileHead: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: C.ink,
  },
  glyphProfileShoulders: {
    width: 16,
    height: 7,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: C.ink,
  },
  profileHeroCard: {
    backgroundColor: "#1E1E24",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#2A2C34",
  },
  profileAvatarLargeWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    position: "relative",
    marginBottom: 12,
    borderWidth: 2,
    borderColor: C.lime,
    backgroundColor: "#2A2A34",
    alignItems: "center",
    justifyContent: "center",
  },
  profileOnlineBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.lime,
    borderWidth: 2,
    borderColor: "#1E1E24",
  },
  profileName: {
    fontSize: 20,
    fontWeight: "800",
    color: C.white,
    letterSpacing: -0.3,
  },
  profileCodePill: {
    backgroundColor: "rgba(221, 247, 99, 0.12)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 6,
    marginBottom: 4,
  },
  profileCodeText: {
    color: C.lime,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  profileSubRole: {
    fontSize: 12,
    color: "#8C8E9B",
  },
  profileSectionCard: {
    backgroundColor: "#1C1D23",
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#262832",
  },
  profileSectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  profileSectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: C.white,
  },
  profileStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  profileStatusBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  profileDivider: {
    height: 1,
    backgroundColor: "#272935",
    marginVertical: 12,
  },
  profileInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  profileInfoLabel: {
    fontSize: 13,
    color: "#8C8E9B",
  },
  profileInfoValue: {
    fontSize: 13,
    color: C.white,
    fontWeight: "600",
    maxWidth: "60%",
    textAlign: "right",
  },
  profileLogoutButton: {
    height: 52,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#4A2A2A",
    backgroundColor: "rgba(250, 84, 84, 0.08)",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 6,
    marginBottom: 16,
  },
  profileLogoutText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FF6B6B",
  },
});
