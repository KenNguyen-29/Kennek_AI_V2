"use client";

import { useCallback, useEffect, useState } from "react";

import {
  loadSettings,
  type AppLanguage,
  type KennekSettings,
} from "./settings-storage";

export const chatCopy = {
  vi: {
    newChat: "Cuộc trò chuyện mới",
    loading: "Đang tải...",
    loginToSave: "Đăng nhập để lưu và xem lịch sử hội thoại.",
    login: "Đăng nhập",
    logout: "Đăng xuất",
    noSessions: "Chưa có cuộc trò chuyện nào",
    settings: "Cài đặt",
    headerTitle: "Analytics Command Center",
    systemOnline: "SYSTEM ONLINE",
    splashTitle: "Bạn muốn bắt đầu từ đâu?",
    splashSubtitle:
      "Chọn tác vụ nhanh bên dưới, hoặc nhập lệnh / dán ảnh (Ctrl+V) để bắt đầu.",
    execute: "Execute →",
    inputPlaceholder: "Hỏi bất kiểu điều gì",
    inputHint: "Enter gửi · Ctrl+V ảnh · PDF / DOCX / Excel / Vision",
    attach: "Đính kèm tài liệu",
    send: "Gửi tin nhắn",
    deleteSessionConfirm: "Xóa cuộc trò chuyện này?",
    deleteSessionTitle: "Bạn có chắc chắn muốn xoá?",
    deleteSessionBodyPrefix: "Cuộc trò chuyện",
    deleteSessionBodySuffix: "sẽ bị xoá vĩnh viễn và không thể khôi phục.",
    cancel: "Huỷ",
    confirmDelete: "Xác nhận xoá",
    confirmDeleteTitle: "Confirm Delete",
    uploadingDocs: "Đang nạp tài liệu vào kho tri thức...",
    uploadSummary: (files: string, chunks: number) =>
      `Đã tiếp nhận ${files}. Nạp ${chunks} đoạn vào kho tri thức. Bạn có thể hỏi về nội dung các file này.`,
    uploadFailed: "Không thể upload tài liệu.",
    uploadErrorPrefix: "**Lỗi upload:**",
    preparingImage: "Đang chuẩn bị ảnh...",
    imageReadError: "**Lỗi:** Không đọc được ảnh từ clipboard/file.",
    analyzeAttachment: "Hãy phân tích ảnh đính kèm.",
    attachedImages: (count: number) => `[Đính kèm ${count} ảnh]`,
    processing: "Đang xử lý...",
    errorPrefix: "\n\n**Lỗi:** ",
    connectionError:
      "\n\n**Không thể kết nối tới máy chủ AI.** Hãy kiểm tra FastAPI tại `localhost:8000`.",
    removeFile: (name: string) => `Xóa ${name}`,
    deleteSessionAria: (title: string) => `Xóa ${title}`,
    quickTasks: [
      {
        id: "pdf",
        title: "Phân tích PDF",
        description: "Trích xuất & tóm tắt tài liệu kỹ thuật",
        prompt:
          "Hướng dẫn tôi phân tích một file PDF vừa upload: tóm tắt cấu trúc, điểm chính và các số liệu quan trọng.",
      },
      {
        id: "excel",
        title: "Lập bảng Excel",
        description: "Chuyển dữ liệu thô thành bảng có cấu trúc",
        prompt:
          "Hãy giúp tôi lập bảng Excel từ dữ liệu mô tả. Đề xuất cột, công thức và cách trình bày rõ ràng.",
      },
      {
        id: "vision",
        title: "Mô tả Hình ảnh",
        description: "OCR / đọc UI / phân tích screenshot",
        prompt:
          "Tôi sẽ dán ảnh (Ctrl+V). Hãy sẵn sàng phân tích hình ảnh: mô tả nội dung, đọc chữ trên ảnh và chỉ ra điểm cần chú ý.",
      },
    ],
  },
  en: {
    newChat: "New conversation",
    loading: "Loading...",
    loginToSave: "Sign in to save and view chat history.",
    login: "Sign in",
    logout: "Sign out",
    noSessions: "No conversations yet",
    settings: "Settings",
    headerTitle: "Analytics Command Center",
    systemOnline: "SYSTEM ONLINE",
    splashTitle: "Where do you want to start?",
    splashSubtitle:
      "Pick a quick task below, or type a command / paste an image (Ctrl+V) to begin.",
    execute: "Execute →",
    inputPlaceholder: "Ask anything",
    inputHint: "Enter to send · Ctrl+V image · PDF / DOCX / Excel / Vision",
    attach: "Attach documents",
    send: "Send message",
    deleteSessionConfirm: "Delete this conversation?",
    deleteSessionTitle: "Are you sure you want to delete?",
    deleteSessionBodyPrefix: "Conversation",
    deleteSessionBodySuffix: "will be permanently deleted and cannot be recovered.",
    cancel: "Cancel",
    confirmDelete: "Confirm delete",
    confirmDeleteTitle: "Confirm Delete",
    uploadingDocs: "Ingesting documents into the knowledge base...",
    uploadSummary: (files: string, chunks: number) =>
      `Received ${files}. Indexed ${chunks} chunks into the knowledge base. You can ask about these files now.`,
    uploadFailed: "Unable to upload documents.",
    uploadErrorPrefix: "**Upload error:**",
    preparingImage: "Preparing image...",
    imageReadError: "**Error:** Could not read the image from clipboard/file.",
    analyzeAttachment: "Please analyze the attached image(s).",
    attachedImages: (count: number) => `[Attached ${count} image(s)]`,
    processing: "Processing...",
    errorPrefix: "\n\n**Error:** ",
    connectionError:
      "\n\n**Could not reach the AI server.** Check FastAPI at `localhost:8000`.",
    removeFile: (name: string) => `Remove ${name}`,
    deleteSessionAria: (title: string) => `Delete ${title}`,
    quickTasks: [
      {
        id: "pdf",
        title: "Analyze PDF",
        description: "Extract & summarize technical documents",
        prompt:
          "Guide me through analyzing an uploaded PDF: summarize structure, key points, and important figures.",
      },
      {
        id: "excel",
        title: "Build Excel table",
        description: "Turn raw data into a structured spreadsheet",
        prompt:
          "Help me build an Excel table from described data. Suggest columns, formulas, and a clear layout.",
      },
      {
        id: "vision",
        title: "Describe image",
        description: "OCR / UI reading / screenshot analysis",
        prompt:
          "I will paste an image (Ctrl+V). Be ready to analyze it: describe content, read on-screen text, and highlight what matters.",
      },
    ],
  },
} as const;

export type ChatCopy = (typeof chatCopy)["vi"];

export function getChatCopy(language: AppLanguage): ChatCopy {
  return chatCopy[language] as ChatCopy;
}

export function useAppLanguage() {
  const [language, setLanguage] = useState<AppLanguage>("vi");

  const refresh = useCallback(() => {
    setLanguage(loadSettings().system.language);
  }, []);

  useEffect(() => {
    refresh();
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<KennekSettings>).detail;
      if (detail?.system?.language) {
        setLanguage(detail.system.language);
        return;
      }
      refresh();
    };
    window.addEventListener("kennek-settings-changed", onChanged);
    window.addEventListener("storage", onChanged);
    return () => {
      window.removeEventListener("kennek-settings-changed", onChanged);
      window.removeEventListener("storage", onChanged);
    };
  }, [refresh]);

  return language;
}
