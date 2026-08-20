"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  LoaderCircle,
  LogIn,
  LogOut,
  MessageSquare,
  Plus,
  Settings2,
  Trash2,
  User,
  X,
} from "lucide-react";
import { signIn, signOut } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";

export type SidebarSession = {
  id: string;
  title: string;
};

type ChatSidebarProps = {
  open: boolean;
  onClose: () => void;
  authStatus: "loading" | "authenticated" | "unauthenticated";
  userEmail: string | null;
  userName: string | null;
  userImage: string | null;
  sessions: SidebarSession[];
  activeSessionId: string | null;
  isLoadingHistory: boolean;
  labels: {
    newChat: string;
    loading: string;
    loginToSave: string;
    login: string;
    logout: string;
    noSessions: string;
    settings: string;
    deleteSessionAria: (title: string) => string;
  };
  onNewChat: () => void;
  onOpenSettings: () => void;
  onLoadSession: (id: string) => void;
  onRequestDeleteSession: (session: SidebarSession) => void;
};

function SidebarBody({
  collapsed,
  onNavigate,
  authStatus,
  userEmail,
  userName,
  userImage,
  sessions,
  activeSessionId,
  isLoadingHistory,
  labels,
  onNewChat,
  onOpenSettings,
  onLoadSession,
  onRequestDeleteSession,
}: ChatSidebarProps & { collapsed?: boolean; onNavigate?: () => void }) {
  const run = (fn: () => void) => {
    fn();
    onNavigate?.();
  };

  return (
    <>
      <div
        className={`flex h-14 items-center border-b border-kennek-steel/80 lg:h-16 ${
          collapsed ? "justify-center px-2" : "gap-3 px-4 lg:px-5"
        }`}
      >
        <div className="clip-chamfer-sm relative h-9 w-9 shrink-0 overflow-hidden bg-kennek-black">
          <Image
            src="/logo_Kennek.png"
            alt="Kennek"
            fill
            sizes="36px"
            className="object-cover"
            priority
          />
        </div>
        {!collapsed ? (
          <div className="min-w-0">
            <p className="font-semibold tracking-wide text-kennek-ink">
              Kennek AI
            </p>
            <p className="kennek-label mt-0.5">Command Center</p>
          </div>
        ) : null}
      </div>

      <div className={`p-2 lg:p-3 ${collapsed ? "flex justify-center" : ""}`}>
        <button
          type="button"
          title={labels.newChat}
          onClick={() => run(onNewChat)}
          className={`group kennek-frame kennek-frame-active ${
            collapsed ? "w-11" : "w-full"
          }`}
        >
          <span
            className={`kennek-frame-inner flex items-center text-sm font-semibold text-kennek-mist transition group-hover:bg-kennek-steel/40 group-hover:text-kennek-ink ${
              collapsed ? "justify-center p-2.5" : "w-full gap-3 px-4 py-3"
            }`}
          >
            <Plus className="h-4 w-4 text-kennek-orange" strokeWidth={2.5} />
            {!collapsed ? labels.newChat : null}
          </span>
        </button>
      </div>

      <div
        className={`min-h-0 flex-1 overflow-y-auto pb-4 ${
          collapsed ? "px-1.5" : "px-2 lg:px-3"
        }`}
      >
        {authStatus === "loading" ? (
          <div
            className={`flex items-center gap-2 py-4 text-sm text-kennek-ash ${
              collapsed ? "justify-center" : "px-3"
            }`}
          >
            <LoaderCircle className="h-4 w-4 animate-spin text-kennek-orange" />
            {!collapsed ? labels.loading : null}
          </div>
        ) : !userEmail ? (
          collapsed ? (
            <Link
              href="/auth/signin"
              title={labels.login}
              onClick={() => onNavigate?.()}
              className="mx-auto flex h-11 w-11 items-center justify-center clip-chamfer-sm bg-kennek-orange text-kennek-on-accent"
            >
              <LogIn className="h-4 w-4" strokeWidth={2.5} />
            </Link>
          ) : (
            <div className="space-y-3 px-1 py-2">
              <p className="px-2 text-sm text-kennek-ash">{labels.loginToSave}</p>
              <Link
                href="/auth/signin"
                onClick={() => onNavigate?.()}
                className="kennek-frame block w-full"
              >
                <span className="kennek-frame-inner flex w-full items-center justify-center gap-2 bg-kennek-orange px-4 py-2.5 text-sm font-bold text-kennek-on-accent transition hover:brightness-110">
                  <LogIn className="h-4 w-4" strokeWidth={2.5} />
                  {labels.login}
                </span>
              </Link>
            </div>
          )
        ) : isLoadingHistory ? (
          <div
            className={`flex items-center gap-2 py-4 text-sm text-kennek-ash ${
              collapsed ? "justify-center" : "px-3"
            }`}
          >
            <LoaderCircle className="h-4 w-4 animate-spin text-kennek-orange" />
            {!collapsed ? labels.loading : null}
          </div>
        ) : sessions.length > 0 ? (
          <div className="space-y-1">
            {sessions.map((chatSession) => {
              const active = activeSessionId === chatSession.id;
              if (collapsed) {
                return (
                  <button
                    key={chatSession.id}
                    type="button"
                    title={chatSession.title}
                    onClick={() =>
                      run(() => onLoadSession(chatSession.id))
                    }
                    className={`mx-auto flex h-11 w-11 items-center justify-center clip-chamfer-sm transition ${
                      active
                        ? "bg-kennek-orange/15 text-kennek-orange ring-1 ring-inset ring-kennek-orange/50"
                        : "text-kennek-ash hover:bg-kennek-panel hover:text-kennek-ink"
                    }`}
                  >
                    <MessageSquare className="h-4 w-4" strokeWidth={2.25} />
                  </button>
                );
              }
              return (
                <div
                  key={chatSession.id}
                  className={`group flex w-full items-center gap-1 clip-chamfer-sm pr-1 text-sm transition ${
                    active
                      ? "bg-kennek-orange/15 text-kennek-ink ring-1 ring-inset ring-kennek-orange/50"
                      : "text-kennek-mist hover:bg-kennek-panel hover:text-kennek-ink"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      run(() => onLoadSession(chatSession.id))
                    }
                    className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left"
                  >
                    <MessageSquare
                      className={`h-4 w-4 shrink-0 ${
                        active ? "text-kennek-orange" : "text-kennek-ash"
                      }`}
                      strokeWidth={2.25}
                    />
                    <span className="truncate">{chatSession.title}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRequestDeleteSession(chatSession);
                    }}
                    aria-label={labels.deleteSessionAria(chatSession.title)}
                    className="shrink-0 p-2 text-kennek-ash opacity-0 transition hover:text-kennek-orange group-hover:opacity-100 focus:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2.4} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : !collapsed ? (
          <p className="px-3 py-4 text-sm text-kennek-mist">
            {labels.noSessions}
          </p>
        ) : null}
      </div>

      <div
        className={`space-y-2 border-t border-kennek-steel/80 ${
          collapsed ? "p-2" : "p-3"
        }`}
      >
        <button
          type="button"
          title={labels.settings}
          onClick={() => run(onOpenSettings)}
          className={`kennek-frame ${collapsed ? "mx-auto w-11" : "w-full"}`}
        >
          <span
            className={`kennek-frame-inner flex items-center text-sm text-kennek-mist transition hover:text-kennek-orange ${
              collapsed ? "justify-center p-2.5" : "w-full gap-3 px-3 py-2.5"
            }`}
          >
            <Settings2 className="h-4 w-4" strokeWidth={2.5} />
            {!collapsed ? labels.settings : null}
          </span>
        </button>

        {userEmail ? (
          collapsed ? (
            <button
              type="button"
              title={labels.logout}
              onClick={() => void signOut({ callbackUrl: "/auth/signin" })}
              className="mx-auto flex h-11 w-11 items-center justify-center overflow-hidden clip-chamfer-avatar bg-kennek-steel"
            >
              {userImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={userImage}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <User className="h-4 w-4 text-kennek-orange" strokeWidth={2.5} />
              )}
            </button>
          ) : (
            <div className="kennek-frame">
              <div className="kennek-frame-inner flex items-center gap-3 px-3 py-2.5">
                <div className="clip-chamfer-avatar relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden bg-kennek-steel">
                  {userImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={userImage}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <User
                      className="h-4 w-4 text-kennek-orange"
                      strokeWidth={2.5}
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-kennek-ink">
                    {userName ?? "Operator"}
                  </p>
                  <p className="truncate font-mono text-[10px] text-kennek-ash">
                    {userEmail}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void signOut({ callbackUrl: "/auth/signin" })}
                  aria-label={labels.logout}
                  className="p-2 text-kennek-ash transition hover:text-kennek-orange"
                >
                  <LogOut className="h-4 w-4" strokeWidth={2.5} />
                </button>
              </div>
            </div>
          )
        ) : (
          <button
            type="button"
            title={labels.login}
            onClick={() => void signIn(undefined, { callbackUrl: "/" })}
            className={`kennek-frame ${collapsed ? "mx-auto w-11" : "w-full"}`}
          >
            <span
              className={`kennek-frame-inner flex items-center text-sm text-kennek-mist transition hover:text-kennek-orange ${
                collapsed ? "justify-center p-2.5" : "w-full justify-center gap-2 px-4 py-2.5"
              }`}
            >
              <LogIn className="h-4 w-4" strokeWidth={2.5} />
              {!collapsed ? labels.login : null}
            </span>
          </button>
        )}
      </div>
    </>
  );
}

export function ChatSidebar(props: ChatSidebarProps) {
  const { open, onClose } = props;

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      {/* Tablet rail */}
      <aside className="relative hidden w-16 shrink-0 flex-col bg-kennek-black md:flex lg:hidden">
        <div className="kennek-rail absolute inset-y-0 right-0 w-[3px]" aria-hidden />
        <SidebarBody {...props} collapsed />
      </aside>

      {/* Desktop expanded */}
      <aside className="relative hidden w-64 shrink-0 flex-col bg-kennek-black lg:flex xl:w-72">
        <div className="kennek-rail absolute inset-y-0 right-0 w-[3px]" aria-hidden />
        <div
          className="pointer-events-none absolute inset-y-0 right-[5px] w-px bg-kennek-orange/35"
          aria-hidden
        />
        <SidebarBody {...props} />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open ? (
          <>
            <motion.button
              type="button"
              aria-label="Close menu"
              className="fixed inset-0 z-40 bg-kennek-overlay backdrop-blur-sm md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 flex w-[min(18rem,88vw)] flex-col bg-kennek-black shadow-2xl md:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
            >
              <div className="kennek-rail absolute inset-y-0 right-0 w-[3px]" aria-hidden />
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute right-3 top-3 z-10 p-2 text-kennek-ash transition hover:text-kennek-orange"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
              <SidebarBody {...props} onNavigate={onClose} />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
