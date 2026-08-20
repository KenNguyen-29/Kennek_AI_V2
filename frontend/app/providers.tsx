"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

import { ThemeProvider } from "./theme/theme-context";
import { ToastProvider } from "./components/ToastProvider";

type ProvidersProps = {
  children: ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider>
      <SessionProvider>
        <ToastProvider>{children}</ToastProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
