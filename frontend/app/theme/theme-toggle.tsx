"use client";

import { Moon, Sun } from "lucide-react";

import { useTheme } from "./theme-context";

export function ThemeToggle() {
  const { resolved, setMode } = useTheme();
  const isLight = resolved === "light";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isLight}
      aria-label={isLight ? "Chuyển sang chế độ tối" : "Chuyển sang chế độ sáng"}
      title={isLight ? "Chế độ sáng" : "Chế độ tối"}
      onClick={() => setMode(isLight ? "dark" : "light")}
      className="kennek-frame group"
    >
      <span
        className={`kennek-frame-inner relative flex h-9 w-[3.75rem] items-center px-1 transition-colors ${
          isLight ? "bg-kennek-orange/20" : "bg-kennek-panel"
        }`}
      >
        <span
          className={`absolute top-1 flex h-7 w-7 items-center justify-center clip-chamfer-avatar shadow-sm transition-all duration-200 ${
            isLight
              ? "left-[calc(100%-1.95rem)] bg-kennek-orange text-kennek-on-accent"
              : "left-1 bg-kennek-steel text-kennek-mist"
          }`}
        >
          {isLight ? (
            <Sun className="h-3.5 w-3.5" strokeWidth={2.5} />
          ) : (
            <Moon className="h-3.5 w-3.5" strokeWidth={2.5} />
          )}
        </span>
        <span className="sr-only">
          {isLight ? "Sáng" : "Tối"}
        </span>
      </span>
    </button>
  );
}
