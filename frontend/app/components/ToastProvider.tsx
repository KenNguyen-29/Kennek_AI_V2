"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastType = "success" | "error" | "warning" | "info";

export type ToastPayload = {
  type: ToastType;
  message: string;
  duration?: number;
};

type ToastContextValue = {
  showToast: (payload: ToastPayload) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

const ICON_CLASS = {
  success: "text-kennek-orange",
  error: "text-red-400",
  warning: "text-amber-400",
  info: "text-kennek-mist",
} as const;

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const dismiss = useCallback(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setToast(null);
  }, []);

  const showToast = useCallback(
    (payload: ToastPayload) => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      setToast(payload);
      timeoutRef.current = window.setTimeout(
        () => setToast(null),
        payload.duration ?? 4500,
      );
    },
    [],
  );

  useEffect(() => () => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }
  }, []);

  const Icon = toast ? ICONS[toast.type] : CheckCircle2;

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <AnimatePresence>
          {toast ? (
            <motion.div
              key={toast.message}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="pointer-events-auto w-[min(92vw,28rem)]"
            >
              <div className="kennek-frame kennek-frame-active shadow-2xl">
                <div className="kennek-frame-inner flex items-start gap-3 bg-kennek-panel px-4 py-3 text-sm text-kennek-ink">
                  <Icon
                    className={`mt-0.5 h-4 w-4 shrink-0 ${ICON_CLASS[toast.type]}`}
                    strokeWidth={2.4}
                  />
                  <p className="min-w-0 flex-1 leading-5">{toast.message}</p>
                  <button
                    type="button"
                    onClick={dismiss}
                    aria-label="Dismiss"
                    className="shrink-0 p-0.5 text-kennek-ash transition hover:text-kennek-orange"
                  >
                    <X className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
