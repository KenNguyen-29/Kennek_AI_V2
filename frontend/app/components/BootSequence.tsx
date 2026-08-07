"use client";

import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { loadSettings } from "../lib/settings-storage";
import { useTheme } from "../theme/theme-context";

const TOTAL_MS = 2000;

const BOOT_LINES = [
  "> Loading AI Models... OK",
  "> Connecting Groq Cloud API... OK",
  "> Initializing UI Command Center... OK",
] as const;

type BootSequenceProps = {
  onComplete: () => void;
};

function KennekMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <motion.g
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35, delay: 0.55, ease: "easeOut" }}
      >
        <path d="M18 12h16v72H18V12Z" fill="#ff6a00" />
        <path d="M38 48 L62 22 L70 22 L46 48 L70 74 L62 74 Z" fill="#ff6a00" />
        <path
          d="M52 48 L78 18 Q82 14 86 18 L86 26 L62 48 L86 70 L86 78 Q82 82 78 78 L52 48Z"
          fill="#ff6a00"
        />
      </motion.g>

      <motion.path
        d="M18 12h16v72H18V12Z"
        stroke="#ff6a00"
        strokeWidth="2.5"
        strokeLinejoin="miter"
        fill="transparent"
        initial={{ pathLength: 0, opacity: 0.2 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.55, ease: "easeInOut" }}
      />
      <motion.path
        d="M38 48 L62 22 L70 22 L46 48 L70 74 L62 74 Z"
        stroke="#ff6a00"
        strokeWidth="2.5"
        strokeLinejoin="miter"
        fill="transparent"
        initial={{ pathLength: 0, opacity: 0.2 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.55, delay: 0.08, ease: "easeInOut" }}
      />
      <motion.path
        d="M52 48 L78 18 Q82 14 86 18 L86 26 L62 48 L86 70 L86 78 Q82 82 78 78 L52 48Z"
        stroke="#ff6a00"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="transparent"
        initial={{ pathLength: 0, opacity: 0.2 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.14, ease: "easeInOut" }}
      />
    </svg>
  );
}

function Typewriter({
  text,
  cps = 42,
  isLight,
}: {
  text: string;
  cps?: number;
  isLight: boolean;
}) {
  const [shown, setShown] = useState("");

  useEffect(() => {
    let i = 0;
    setShown("");
    const id = window.setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) {
        window.clearInterval(id);
      }
    }, 1000 / cps);
    return () => window.clearInterval(id);
  }, [cps, text]);

  return (
    <span
      className={`font-mono text-[11px] tracking-[0.14em] sm:text-xs ${
        isLight ? "text-[#5a636e]" : "text-kennek-mist"
      }`}
    >
      {shown}
      <motion.span
        aria-hidden
        className="ml-0.5 inline-block text-[#ff6a00]"
        animate={{ opacity: [1, 0, 1] }}
        transition={{ duration: 0.7, repeat: Infinity }}
      >
        ▌
      </motion.span>
    </span>
  );
}

export function BootSequence({ onComplete }: BootSequenceProps) {
  const { resolved } = useTheme();
  const isLight = resolved === "light";
  const shellControls = useAnimationControls();
  const markControls = useAnimationControls();
  const [bootIndex, setBootIndex] = useState(-1);
  const [scan, setScan] = useState(false);
  const finishedRef = useRef(false);

  const finish = useCallback(() => {
    if (finishedRef.current) {
      return;
    }
    finishedRef.current = true;
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    const timers: number[] = [];

    timers.push(
      window.setTimeout(() => {
        setScan(true);
        setBootIndex(0);
      }, 800),
    );
    timers.push(window.setTimeout(() => setBootIndex(1), 980));
    timers.push(window.setTimeout(() => setBootIndex(2), 1160));

    timers.push(
      window.setTimeout(() => {
        void markControls.start({
          scale: 0.28,
          x: "-42vw",
          y: "-42vh",
          transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
        });
        void shellControls.start({
          opacity: 0,
          transition: { duration: 0.45, delay: 0.15, ease: "easeOut" },
        });
      }, 1400),
    );

    timers.push(window.setTimeout(finish, TOTAL_MS));

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [finish, markControls, shellControls]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish]);

  const shellBg = isLight ? "#eef0f3" : "#050607";
  const gridAlpha = isLight ? 0.1 : 0.06;
  const terminalMuted = isLight ? "text-[#5a636e]" : "text-kennek-mist";
  const skipMuted = isLight ? "text-[#7a8490]" : "text-kennek-ash";

  return (
    <motion.div
      role="dialog"
      aria-label="Kennek boot sequence"
      aria-live="polite"
      className="fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center overflow-hidden"
      style={{ backgroundColor: shellBg }}
      initial={{ opacity: 1 }}
      animate={shellControls}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
      onClick={finish}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: isLight ? 0.55 : 0.3,
          backgroundImage: `linear-gradient(rgba(255,106,0,${gridAlpha}) 1px, transparent 1px), linear-gradient(90deg, rgba(255,106,0,${gridAlpha}) 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }}
      />

      {isLight ? (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 42%, rgba(255,106,0,0.08), transparent 55%)",
          }}
        />
      ) : null}

      <AnimatePresence>
        {scan && (
          <motion.div
            className="pointer-events-none absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-[#ff6a00] to-transparent"
            style={{
              boxShadow: isLight
                ? "0 0 14px rgba(255,106,0,0.45)"
                : "0 0 18px #ff6a00",
            }}
            initial={{ top: "-2%", opacity: 0 }}
            animate={{ top: "102%", opacity: [0, 1, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: "linear" }}
          />
        )}
      </AnimatePresence>

      <motion.div
        className="relative z-10 flex flex-col items-center"
        animate={markControls}
        initial={{ scale: 1, x: 0, y: 0 }}
      >
        <div className="relative">
          <motion.div
            className="pointer-events-none absolute inset-0"
            initial={{ x: 0, opacity: 0 }}
            animate={{
              x: [0, -3, 2, 0],
              opacity: [0, isLight ? 0.28 : 0.4, 0.12, 0],
            }}
            transition={{ duration: 0.45, delay: 0.2 }}
          >
            <KennekMark className="h-28 w-28 sm:h-32 sm:w-32" />
          </motion.div>
          <motion.div
            className="pointer-events-none absolute inset-0"
            initial={{ x: 0, opacity: 0 }}
            animate={{
              x: [0, 3, -2, 0],
              opacity: [0, isLight ? 0.2 : 0.3, 0.08, 0],
            }}
            transition={{ duration: 0.45, delay: 0.28 }}
          >
            <KennekMark className="h-28 w-28 sm:h-32 sm:w-32" />
          </motion.div>
          <div
            className={
              isLight
                ? "relative shadow-[0_12px_40px_rgba(255,106,0,0.12)]"
                : "relative"
            }
          >
            <KennekMark className="relative h-28 w-28 sm:h-32 sm:w-32" />
          </div>
        </div>

        <div className="mt-8 min-h-[1.25rem] text-center">
          <Typewriter
            text="INITIALIZING KENNEK CORE v2.0..."
            cps={38}
            isLight={isLight}
          />
        </div>
      </motion.div>

      <div
        className={`absolute bottom-16 left-1/2 z-10 w-full max-w-md -translate-x-1/2 px-6 font-mono text-[11px] leading-6 sm:text-xs ${terminalMuted}`}
      >
        {BOOT_LINES.map((line, index) => (
          <motion.p
            key={line}
            initial={{ opacity: 0, x: -8 }}
            animate={
              bootIndex >= index
                ? { opacity: 1, x: 0 }
                : { opacity: 0, x: -8 }
            }
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="truncate"
          >
            <span className="text-[#ff6a00]">{line.slice(0, 1)}</span>
            {line.slice(1, -2)}
            <span className="text-[#ff6a00]">{line.slice(-2)}</span>
          </motion.p>
        ))}
      </div>

      <p
        className={`absolute bottom-6 left-1/2 z-10 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.2em] ${skipMuted}`}
      >
        ESC / Click to skip
      </p>
    </motion.div>
  );
}

type BootGateProps = {
  children: ReactNode;
};

function BootSplash() {
  const { resolved } = useTheme();
  const isLight = resolved === "light";
  return (
    <div
      className="fixed inset-0 z-[100]"
      style={{ backgroundColor: isLight ? "#eef0f3" : "#050607" }}
      aria-hidden
    />
  );
}

export function BootGate({ children }: BootGateProps) {
  const [showIntro, setShowIntro] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const settings = loadSettings();
    setShowIntro(settings.system.introEnabled);
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <>
        {children}
        <BootSplash />
      </>
    );
  }

  return (
    <>
      {children}
      <AnimatePresence mode="wait">
        {showIntro ? (
          <BootSequence key="boot" onComplete={() => setShowIntro(false)} />
        ) : null}
      </AnimatePresence>
    </>
  );
}
