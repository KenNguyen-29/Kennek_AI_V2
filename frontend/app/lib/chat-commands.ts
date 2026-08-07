import type { LucideIcon } from "lucide-react";
import {
  Brain,
  Code2,
  Eraser,
  FileSpreadsheet,
  FileText,
  ImageIcon,
} from "lucide-react";

export type ChatCommandId =
  | "pdf"
  | "excel"
  | "vision"
  | "code"
  | "reasoning"
  | "clear";

export type ChatCommandDef = {
  id: ChatCommandId;
  trigger: `@${ChatCommandId}`;
  icon: LucideIcon;
  titleVi: string;
  titleEn: string;
  descriptionVi: string;
  descriptionEn: string;
  /** When true, selecting runs an action instead of becoming an active mode badge. */
  isAction?: boolean;
};

export const CHAT_COMMANDS: readonly ChatCommandDef[] = [
  {
    id: "pdf",
    trigger: "@pdf",
    icon: FileText,
    titleVi: "Đọc & Phân tích PDF/Word",
    titleEn: "Read & Analyze PDF/Word",
    descriptionVi: "Điều hướng xử lý tài liệu văn bản",
    descriptionEn: "Route for document analysis",
  },
  {
    id: "excel",
    trigger: "@excel",
    icon: FileSpreadsheet,
    titleVi: "Xử lý Bảng tính Excel/CSV",
    titleEn: "Excel / CSV Spreadsheets",
    descriptionVi: "Phân tích dữ liệu, công thức, bảng biểu",
    descriptionEn: "Data, formulas, and tables",
  },
  {
    id: "vision",
    trigger: "@vision",
    icon: ImageIcon,
    titleVi: "Đọc & Trích xuất Hình ảnh",
    titleEn: "Vision / OCR",
    descriptionVi: "Kích hoạt Qwen Vision / OCR",
    descriptionEn: "Activate Qwen Vision / OCR",
  },
  {
    id: "code",
    trigger: "@code",
    icon: Code2,
    titleVi: "Viết Code & Debug",
    titleEn: "Code & Debug",
    descriptionVi: "Tối ưu prompt lập trình, sửa lỗi",
    descriptionEn: "Coding-focused prompts & debugging",
  },
  {
    id: "reasoning",
    trigger: "@reasoning",
    icon: Brain,
    titleVi: "Suy luận Sâu (DeepThink)",
    titleEn: "Deep Reasoning",
    descriptionVi: "Kích hoạt DeepSeek-R1",
    descriptionEn: "Activate DeepSeek-R1",
  },
  {
    id: "clear",
    trigger: "@clear",
    icon: Eraser,
    titleVi: "Làm sạch hội thoại",
    titleEn: "Clear conversation",
    descriptionVi: "Xóa nhanh ngữ cảnh chat hiện tại",
    descriptionEn: "Clear the current chat context",
    isAction: true,
  },
] as const;

export type ActiveChatCommand = Exclude<ChatCommandId, "clear">;

export function isActiveChatCommand(
  value: string | null | undefined,
): value is ActiveChatCommand {
  return (
    value === "pdf" ||
    value === "excel" ||
    value === "vision" ||
    value === "code" ||
    value === "reasoning"
  );
}

export function getCommandById(
  id: ChatCommandId,
): ChatCommandDef | undefined {
  return CHAT_COMMANDS.find((command) => command.id === id);
}

export function filterChatCommands(query: string): ChatCommandDef[] {
  const normalized = query.trim().toLowerCase().replace(/^@/, "");
  if (!normalized) {
    return [...CHAT_COMMANDS];
  }
  return CHAT_COMMANDS.filter(
    (command) =>
      command.id.startsWith(normalized) ||
      command.titleEn.toLowerCase().includes(normalized) ||
      command.titleVi.toLowerCase().includes(normalized),
  );
}
