"use client";

import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock3,
  Globe2,
  LoaderCircle,
  MonitorPlay,
  Save,
  Settings2,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  clearLocalCaches,
  DEFAULT_SETTINGS,
  loadSettings,
  MODEL_OPTIONS,
  saveSettings,
  type KennekSettings,
} from "../lib/settings-storage";
import { ThemeToggle } from "../theme/theme-toggle";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

type SettingsTab = "models" | "system";

const TABS: Array<{
  id: SettingsTab;
  labelVi: string;
  labelEn: string;
  icon: typeof SlidersHorizontal;
}> = [
  {
    id: "models",
    labelVi: "Tùy chọn Model AI",
    labelEn: "Model Preferences",
    icon: SlidersHorizontal,
  },
  {
    id: "system",
    labelVi: "Ngôn ngữ & Giao diện",
    labelEn: "System & i18n",
    icon: Globe2,
  },
];

type ToastState = {
  type: "ok" | "error" | "info";
  message: string;
} | null;

function SettingsCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="kennek-frame">
      <div className="kennek-frame-inner bg-kennek-panel p-5">
        <div className="mb-5 border-b border-kennek-steel/60 pb-4">
          <h2 className="vi-safe text-base font-semibold text-kennek-ink">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 text-sm text-kennek-mist">{subtitle}</p>
          ) : null}
        </div>
        {children}
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const userEmail = session?.user?.email ?? null;

  const [tab, setTab] = useState<SettingsTab>("models");
  const [settings, setSettings] = useState<KennekSettings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [clearing, setClearing] = useState(false);
  const [retentionSyncing, setRetentionSyncing] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!userEmail) {
      return;
    }

    let cancelled = false;
    const syncRetention = async () => {
      try {
        const response = await fetch(
          `${API_BASE}/api/user/preferences?user_email=${encodeURIComponent(userEmail)}`,
        );
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as {
          auto_delete_chats_after_days: number | null;
        };
        if (cancelled) {
          return;
        }
        const enabled = data.auto_delete_chats_after_days === 30;
        setSettings((current) => {
          if (current.system.autoDeleteChatsAfter30Days === enabled) {
            return current;
          }
          const next = {
            ...current,
            system: {
              ...current.system,
              autoDeleteChatsAfter30Days: enabled,
            },
          };
          saveSettings(next);
          return next;
        });
      } catch {
        // Keep local cache if server sync fails.
      }
    };

    void syncRetention();
    return () => {
      cancelled = true;
    };
  }, [userEmail]);

  const copy = useMemo(() => {
    const vi = settings.system.language === "vi";
    return {
      title: "Settings Command Center",
      back: vi ? "Quay lại Workspace" : "Back to Workspace",
      saveModels: vi ? "Lưu Model Preferences" : "Save Model Preferences",
      saveSystem: vi ? "Lưu cấu hình hệ thống" : "Save System Preferences",
      modelsTitle: vi ? "Tùy chọn Model AI" : "Model Preferences",
      modelsSubtitle: vi
        ? "Router mặc định theo tác vụ. Backend hiện ưu tiên routing tự động; các giá trị này lưu cho cấu hình client."
        : "Default router by task. The backend currently prefers automatic routing; these values are stored for client config.",
      temperatureHint: vi
        ? "Thấp = ổn định / chính xác hơn. Cao = sáng tạo hơn. Áp dụng cho mỗi tin nhắn chat."
        : "Low = steadier / more precise. High = more creative. Applied on every chat message.",
      savedModels: vi
        ? "Đã lưu Model Preferences."
        : "Model Preferences saved.",
      languageTitle: vi ? "Ngôn ngữ" : "Language",
      languageSubtitle: vi
        ? "Ngôn ngữ giao diện Settings / nhãn hệ thống."
        : "Settings UI language / system labels.",
      defaultViewTitle: vi ? "Giao diện mặc định" : "Default View",
      defaultViewSubtitle: vi
        ? "Điều khiển Intro Boot Sequence khi mở Workspace."
        : "Control the Intro Boot Sequence when opening Workspace.",
      introLabel: "Intro Bootup Sequence",
      memoryTitle: vi ? "Bộ nhớ hệ thống" : "System Memory",
      memorySubtitle: vi
        ? "Dọn lịch sử chat server-side hoặc cache trình duyệt."
        : "Clear server-side chat history or browser cache.",
      autoDeleteLabel: vi
        ? "Tự động xóa chat sau 30 ngày"
        : "Auto-delete chats after 30 days",
      autoDeleteHint: vi
        ? "Chat không hoạt động quá 30 ngày sẽ bị xóa trên server (theo lần cập nhật cuối)."
        : "Chats inactive for more than 30 days are deleted on the server (by last update).",
      autoDeleteOn: vi
        ? "Đã bật tự động xóa sau 30 ngày."
        : "Auto-delete after 30 days: ON",
      autoDeleteOff: vi
        ? "Đã tắt tự động xóa sau 30 ngày."
        : "Auto-delete after 30 days: OFF",
      autoDeleteNeedLogin: vi
        ? "Cần đăng nhập để lưu cấu hình tự động xóa trên server."
        : "Sign in to save auto-delete preferences on the server.",
      autoDeleteFailed: vi
        ? "Không lưu được cấu hình tự động xóa."
        : "Could not save auto-delete preference.",
      clearChatHistory: vi ? "Xóa lịch sử Chat" : "Clear Chat History",
      clearLocalCache: vi ? "Xóa Cache Local" : "Clear Local Cache",
      savedSystem: vi
        ? "Đã lưu cấu hình hệ thống."
        : "System preferences saved.",
      needLogin: vi
        ? "Cần đăng nhập để xóa lịch sử chat trên server."
        : "Sign in to delete chat history on the server.",
      confirmClearHistory: vi
        ? "Xóa toàn bộ lịch sử chat trên tài khoản này?"
        : "Delete all chat history for this account?",
      historyLoadFailed: (status: number) =>
        vi
          ? `Không tải được lịch sử (${status})`
          : `Could not load history (${status})`,
      historyCleared: (count: number) =>
        vi
          ? `Đã xóa ${count} cuộc trò chuyện.`
          : `Deleted ${count} conversation(s).`,
      historyClearFailed: vi
        ? "Không xóa được lịch sử."
        : "Could not delete chat history.",
      confirmClearCache: vi
        ? "Xóa cache local (giữ theme & settings)?"
        : "Clear local cache (keep theme & settings)?",
      cacheCleared: vi ? "Đã xóa cache local." : "Local cache cleared.",
    };
  }, [settings.system.language]);

  const showToast = useCallback((next: ToastState) => {
    setToast(next);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const persist = useCallback(
    (next: KennekSettings, message: string) => {
      setSettings(next);
      saveSettings(next);
      showToast({ type: "ok", message });
    },
    [showToast],
  );

  const toggleAutoDelete = async () => {
    if (!userEmail) {
      showToast({
        type: "error",
        message: copy.autoDeleteNeedLogin,
      });
      return;
    }

    const enabled = !settings.system.autoDeleteChatsAfter30Days;
    setRetentionSyncing(true);
    try {
      const response = await fetch(`${API_BASE}/api/user/preferences`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_email: userEmail,
          auto_delete_chats_after_days: enabled ? 30 : null,
        }),
      });
      if (!response.ok) {
        throw new Error(copy.autoDeleteFailed);
      }
      const next = {
        ...settings,
        system: {
          ...settings.system,
          autoDeleteChatsAfter30Days: enabled,
        },
      };
      persist(next, enabled ? copy.autoDeleteOn : copy.autoDeleteOff);
    } catch (error) {
      showToast({
        type: "error",
        message:
          error instanceof Error ? error.message : copy.autoDeleteFailed,
      });
    } finally {
      setRetentionSyncing(false);
    }
  };

  const clearChatHistory = async () => {
    if (!userEmail) {
      showToast({
        type: "error",
        message: copy.needLogin,
      });
      return;
    }

    const confirmed = window.confirm(copy.confirmClearHistory);
    if (!confirmed) {
      return;
    }

    setClearing(true);
    try {
      const listResponse = await fetch(
        `${API_BASE}/api/chat/history/${encodeURIComponent(userEmail)}`,
      );
      if (!listResponse.ok) {
        throw new Error(copy.historyLoadFailed(listResponse.status));
      }
      const sessions = (await listResponse.json()) as Array<{ id: string }>;
      await Promise.all(
        sessions.map((item) =>
          fetch(
            `${API_BASE}/api/chat/sessions/${item.id}?user_email=${encodeURIComponent(userEmail)}`,
            { method: "DELETE" },
          ),
        ),
      );
      showToast({
        type: "ok",
        message: copy.historyCleared(sessions.length),
      });
    } catch (error) {
      showToast({
        type: "error",
        message:
          error instanceof Error ? error.message : copy.historyClearFailed,
      });
    } finally {
      setClearing(false);
    }
  };

  const clearCaches = () => {
    const confirmed = window.confirm(copy.confirmClearCache);
    if (!confirmed) {
      return;
    }
    clearLocalCaches();
    showToast({ type: "ok", message: copy.cacheCleared });
  };

  if (!hydrated) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[#0B0F17] text-kennek-mist">
        <LoaderCircle className="h-5 w-5 animate-spin text-kennek-orange" />
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-[#0B0F17] text-foreground [.light_&]:bg-kennek-charcoal">
      <div className="pointer-events-none absolute inset-0 kennek-grid opacity-30" />

      <aside className="relative z-10 flex w-64 shrink-0 flex-col border-r border-kennek-steel/70 bg-kennek-black">
        <div className="kennek-rail absolute inset-y-0 right-0 w-[3px]" aria-hidden />

        <div className="flex h-16 items-center gap-3 border-b border-kennek-steel/80 px-4">
          <div className="clip-chamfer-sm relative h-9 w-9 overflow-hidden bg-kennek-black">
            <Image
              src="/logo_Kennek.png"
              alt="Kennek"
              fill
              sizes="36px"
              className="object-cover"
              priority
            />
          </div>
          <div>
            <p className="text-sm font-semibold text-kennek-ink">Settings</p>
            <p className="kennek-label mt-0.5">Command Center</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {TABS.map(({ id, labelVi, labelEn, icon: Icon }) => {
            const active = tab === id;
            const label =
              settings.system.language === "vi" ? labelVi : labelEn;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex w-full items-center gap-3 clip-chamfer px-3 py-3 text-left text-sm transition ${
                  active
                    ? "bg-kennek-orange/15 text-kennek-ink ring-1 ring-inset ring-[#FF5500]"
                    : "text-kennek-mist hover:bg-kennek-panel hover:text-kennek-ink"
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    active ? "text-[#FF5500]" : "text-kennek-ash"
                  }`}
                  strokeWidth={2.4}
                />
                <span className="leading-snug">{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-kennek-steel/80 p-3">
          <Link href="/" className="kennek-frame block w-full">
            <span className="kennek-frame-inner flex w-full items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium text-kennek-mist transition hover:text-kennek-orange">
              <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
              {copy.back}
            </span>
          </Link>
        </div>
      </aside>

      <main className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-kennek-steel/70 bg-[#0B0F17]/90 px-5 backdrop-blur [.light_&]:bg-kennek-charcoal/90">
          <div className="flex min-w-0 items-center gap-3">
            <div className="clip-chamfer-sm flex h-9 w-9 items-center justify-center bg-kennek-panel ring-1 ring-kennek-orange/40">
              <Settings2 className="h-4 w-4 text-kennek-orange" strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold tracking-wide text-kennek-ink">
                {copy.title}
              </h1>
              <p className="font-mono text-[11px] text-kennek-ash">
                CONFIG / OPS / LOCAL PROFILE
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/" className="kennek-frame hidden sm:block">
              <span className="kennek-frame-inner bg-kennek-orange px-3 py-2 text-xs font-bold text-kennek-black">
                {copy.back}
              </span>
            </Link>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            {tab === "models" && (
              <SettingsCard
                title={copy.modelsTitle}
                subtitle={copy.modelsSubtitle}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  {(
                    [
                      ["coreBrain", "Core Brain (Text/Logic)", MODEL_OPTIONS.coreBrain],
                      ["reasoning", "Reasoning (Deep Thinking)", MODEL_OPTIONS.reasoning],
                      ["vision", "Vision (OCR/Image)", MODEL_OPTIONS.vision],
                      ["speech", "Speech-to-Text", MODEL_OPTIONS.speech],
                    ] as const
                  ).map(([key, label, options]) => (
                    <label key={key} className="block space-y-2">
                      <span className="kennek-label">{label}</span>
                      <div className="kennek-frame">
                        <select
                          value={settings.models[key]}
                          onChange={(event) =>
                            setSettings((current) => ({
                              ...current,
                              models: {
                                ...current.models,
                                [key]: event.target.value,
                              },
                            }))
                          }
                          className="kennek-frame-inner w-full bg-kennek-black px-3 py-2.5 font-mono text-xs text-kennek-ink outline-none"
                        >
                          {options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                          {(options as readonly string[]).includes(
                            settings.models[key],
                          ) ? null : (
                            <option value={settings.models[key]}>
                              {settings.models[key]}
                            </option>
                          )}
                        </select>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="mt-6 space-y-5">
                  <label className="block space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="kennek-label">Temperature</span>
                      <span className="font-mono text-xs text-kennek-orange">
                        {settings.models.temperature.toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={settings.models.temperature}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          models: {
                            ...current.models,
                            temperature: Number(event.target.value),
                          },
                        }))
                      }
                      className="w-full accent-[#FF5500]"
                    />
                    <p className="text-xs leading-5 text-kennek-ash">
                      {copy.temperatureHint}
                    </p>
                  </label>
                </div>

                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => persist(settings, copy.savedModels)}
                    className="kennek-frame"
                  >
                    <span className="kennek-frame-inner flex items-center gap-2 bg-[#FF5500] px-4 py-2.5 text-sm font-bold text-kennek-black">
                      <Bot className="h-4 w-4" strokeWidth={2.5} />
                      {copy.saveModels}
                    </span>
                  </button>
                </div>
              </SettingsCard>
            )}

            {tab === "system" && (
              <>
                <SettingsCard
                  title={copy.languageTitle}
                  subtitle={copy.languageSubtitle}
                >
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(
                      [
                        ["vi", "Tiếng Việt", "🇻🇳"],
                        ["en", "English", "🇺🇸"],
                      ] as const
                    ).map(([code, label, flag]) => {
                      const active = settings.system.language === code;
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => {
                            const next = {
                              ...settings,
                              system: { ...settings.system, language: code },
                            };
                            persist(
                              next,
                              code === "en"
                                ? "Language saved: English"
                                : "Đã lưu ngôn ngữ: Tiếng Việt",
                            );
                          }}
                          className={`clip-chamfer px-4 py-3 text-left text-sm transition ring-1 ring-inset ${
                            active
                              ? "bg-kennek-orange/15 text-kennek-ink ring-[#FF5500]"
                              : "bg-kennek-black text-kennek-mist ring-kennek-steel hover:text-kennek-ink"
                          }`}
                        >
                          <span className="mr-2">{flag}</span>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </SettingsCard>

                <SettingsCard
                  title={copy.defaultViewTitle}
                  subtitle={copy.defaultViewSubtitle}
                >
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.system.introEnabled}
                    onClick={() => {
                      const enabled = !settings.system.introEnabled;
                      const next = {
                        ...settings,
                        system: {
                          ...settings.system,
                          introEnabled: enabled,
                        },
                      };
                      persist(
                        next,
                        enabled
                          ? "Intro Bootup: ON"
                          : "Intro Bootup: OFF",
                      );
                    }}
                    className="kennek-frame w-full sm:w-auto"
                  >
                    <span className="kennek-frame-inner flex items-center justify-between gap-4 bg-kennek-black px-4 py-3">
                      <span className="flex items-center gap-2 text-sm text-kennek-mist">
                        <MonitorPlay
                          className="h-4 w-4 text-kennek-orange"
                          strokeWidth={2.4}
                        />
                        {copy.introLabel}
                      </span>
                      <span
                        className={`relative h-7 w-12 clip-chamfer-sm transition ${
                          settings.system.introEnabled
                            ? "bg-[#FF5500]"
                            : "bg-kennek-steel"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-6 w-6 clip-chamfer-avatar bg-kennek-ink transition ${
                            settings.system.introEnabled
                              ? "left-[1.35rem]"
                              : "left-0.5"
                          }`}
                        />
                      </span>
                    </span>
                  </button>
                </SettingsCard>

                <SettingsCard
                  title={copy.memoryTitle}
                  subtitle={copy.memorySubtitle}
                >
                  <div className="space-y-4">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={settings.system.autoDeleteChatsAfter30Days}
                      disabled={retentionSyncing}
                      onClick={() => void toggleAutoDelete()}
                      className="kennek-frame w-full"
                    >
                      <span className="kennek-frame-inner flex items-center justify-between gap-4 bg-kennek-black px-4 py-3">
                        <span className="min-w-0 text-left">
                          <span className="flex items-center gap-2 text-sm text-kennek-mist">
                            {retentionSyncing ? (
                              <LoaderCircle className="h-4 w-4 animate-spin text-kennek-orange" />
                            ) : (
                              <Clock3
                                className="h-4 w-4 text-kennek-orange"
                                strokeWidth={2.4}
                              />
                            )}
                            {copy.autoDeleteLabel}
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-kennek-ash">
                            {copy.autoDeleteHint}
                          </span>
                        </span>
                        <span
                          className={`relative h-7 w-12 shrink-0 clip-chamfer-sm transition ${
                            settings.system.autoDeleteChatsAfter30Days
                              ? "bg-[#FF5500]"
                              : "bg-kennek-steel"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 h-6 w-6 clip-chamfer-avatar bg-kennek-ink transition ${
                              settings.system.autoDeleteChatsAfter30Days
                                ? "left-[1.35rem]"
                                : "left-0.5"
                            }`}
                          />
                        </span>
                      </span>
                    </button>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={clearing}
                        onClick={() => void clearChatHistory()}
                        className="kennek-frame"
                      >
                        <span className="kennek-frame-inner flex items-center gap-2 px-4 py-2.5 text-sm text-kennek-mist hover:text-kennek-orange">
                          {clearing ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" strokeWidth={2.4} />
                          )}
                          {copy.clearChatHistory}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={clearCaches}
                        className="kennek-frame"
                      >
                        <span className="kennek-frame-inner flex items-center gap-2 px-4 py-2.5 text-sm text-kennek-mist hover:text-kennek-orange">
                          <Trash2 className="h-4 w-4" strokeWidth={2.4} />
                          {copy.clearLocalCache}
                        </span>
                      </button>
                    </div>
                  </div>
                </SettingsCard>

                <div>
                  <button
                    type="button"
                    onClick={() => persist(settings, copy.savedSystem)}
                    className="kennek-frame"
                  >
                    <span className="kennek-frame-inner flex items-center gap-2 bg-[#FF5500] px-4 py-2.5 text-sm font-bold text-kennek-black">
                      <Save className="h-4 w-4" strokeWidth={2.5} />
                      {copy.saveSystem}
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {toast && (
          <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 w-[min(92vw,28rem)] -translate-x-1/2">
            <div className="kennek-frame kennek-frame-active">
              <div className="kennek-frame-inner flex items-start gap-2 bg-kennek-panel px-4 py-3 text-sm text-kennek-ink">
                <CheckCircle2
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    toast.type === "error"
                      ? "text-red-400"
                      : toast.type === "info"
                        ? "text-kennek-mist"
                        : "text-kennek-orange"
                  }`}
                  strokeWidth={2.4}
                />
                <p className="leading-5">{toast.message}</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
