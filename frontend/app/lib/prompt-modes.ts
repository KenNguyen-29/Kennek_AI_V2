import type { LucideIcon } from "lucide-react";
import { Brain, Code2, Gauge, Sparkles, Zap } from "lucide-react";

export type PromptMode =
  | "auto"
  | "fast"
  | "balanced"
  | "reasoning"
  | "code";

export type PromptModeDef = {
  id: PromptMode;
  icon: LucideIcon;
  labelVi: string;
  labelEn: string;
  descriptionVi: string;
  descriptionEn: string;
};

export const PROMPT_MODES: readonly PromptModeDef[] = [
  {
    id: "auto",
    icon: Sparkles,
    labelVi: "Tự động",
    labelEn: "Auto",
    descriptionVi: "Router tự chọn model theo nội dung",
    descriptionEn: "Router picks the model from context",
  },
  {
    id: "fast",
    icon: Zap,
    labelVi: "Nhanh",
    labelEn: "Fast",
    descriptionVi: "Llama 3.1 8B Instant — trả lời nhanh",
    descriptionEn: "Llama 3.1 8B Instant — quick replies",
  },
  {
    id: "balanced",
    icon: Gauge,
    labelVi: "Cân bằng",
    labelEn: "Balanced",
    descriptionVi: "Llama 3.3 70B — chất lượng ổn định",
    descriptionEn: "Llama 3.3 70B — solid quality",
  },
  {
    id: "reasoning",
    icon: Brain,
    labelVi: "Suy luận",
    labelEn: "Reasoning",
    descriptionVi: "DeepSeek-R1 — suy luận sâu",
    descriptionEn: "DeepSeek-R1 — deep thinking",
  },
  {
    id: "code",
    icon: Code2,
    labelVi: "Code",
    labelEn: "Code",
    descriptionVi: "Tối ưu lập trình & debug",
    descriptionEn: "Optimized for coding & debug",
  },
] as const;

export const DEFAULT_PROMPT_MODE: PromptMode = "auto";

export function getPromptMode(id: PromptMode): PromptModeDef {
  return (
    PROMPT_MODES.find((mode) => mode.id === id) ?? PROMPT_MODES[0]
  );
}

export function isPromptMode(value: string | null | undefined): value is PromptMode {
  return (
    value === "auto" ||
    value === "fast" ||
    value === "balanced" ||
    value === "reasoning" ||
    value === "code"
  );
}
