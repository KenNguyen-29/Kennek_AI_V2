import type { AppLanguage } from "./settings-storage";

export type NotifyCode =
  | "groq_rate_limit"
  | "groq_auth"
  | "tavily_error"
  | "tavily_missing_key"
  | "file_read_error"
  | "file_upload_error"
  | "file_type_unsupported"
  | "file_too_large"
  | "file_empty"
  | "chat_connection"
  | "chat_history_load"
  | "session_load"
  | "session_delete"
  | "session_persist"
  | "model_unavailable"
  | "moderation_blocked"
  | "agent_error"
  | "generic";

export type NotifySeverity = "success" | "error" | "warning" | "info";

export type NotifyInput = {
  code?: NotifyCode | string;
  message?: string;
  status?: number;
};

const COPY: Record<
  AppLanguage,
  Record<NotifyCode, { severity: NotifySeverity; message: string }>
> = {
  vi: {
    groq_rate_limit: {
      severity: "error",
      message:
        "Groq API đã chạm giới hạn (rate limit). Hãy đợi vài phút rồi thử lại.",
    },
    groq_auth: {
      severity: "error",
      message: "Groq API key không hợp lệ hoặc đã hết hạn.",
    },
    tavily_error: {
      severity: "warning",
      message:
        "Tavily tìm kiếm web thất bại. Hệ thống sẽ trả lời không có nguồn web mới.",
    },
    tavily_missing_key: {
      severity: "warning",
      message: "Chưa cấu hình Tavily API key — bỏ qua tìm kiếm web.",
    },
    file_read_error: {
      severity: "error",
      message: "Không đọc được file ảnh hoặc tài liệu từ thiết bị.",
    },
    file_upload_error: {
      severity: "error",
      message: "Upload tài liệu thất bại. Vui lòng thử lại.",
    },
    file_type_unsupported: {
      severity: "error",
      message: "Định dạng file không được hỗ trợ.",
    },
    file_too_large: {
      severity: "error",
      message: "File quá lớn (tối đa 20MB).",
    },
    file_empty: {
      severity: "error",
      message: "File rỗng — không thể xử lý.",
    },
    chat_connection: {
      severity: "error",
      message:
        "Không kết nối được máy chủ AI. Kiểm tra backend và mạng.",
    },
    chat_history_load: {
      severity: "warning",
      message: "Không tải được lịch sử chat.",
    },
    session_load: {
      severity: "error",
      message: "Không mở được cuộc trò chuyện này.",
    },
    session_delete: {
      severity: "error",
      message: "Không xóa được cuộc trò chuyện.",
    },
    session_persist: {
      severity: "warning",
      message: "Không lưu được tin nhắn lên server.",
    },
    model_unavailable: {
      severity: "error",
      message: "Model AI không khả dụng trên Groq. Kiểm tra cấu hình model.",
    },
    moderation_blocked: {
      severity: "warning",
      message: "Yêu cầu bị chặn bởi bộ lọc nội dung.",
    },
    agent_error: {
      severity: "error",
      message: "Không tạo được phản hồi. Vui lòng thử lại.",
    },
    generic: {
      severity: "error",
      message: "Đã xảy ra lỗi. Vui lòng thử lại.",
    },
  },
  en: {
    groq_rate_limit: {
      severity: "error",
      message:
        "Groq API rate limit reached. Wait a few minutes and try again.",
    },
    groq_auth: {
      severity: "error",
      message: "Groq API key is invalid or expired.",
    },
    tavily_error: {
      severity: "warning",
      message:
        "Tavily web search failed. The answer may omit fresh web sources.",
    },
    tavily_missing_key: {
      severity: "warning",
      message: "Tavily API key is not configured — skipping web search.",
    },
    file_read_error: {
      severity: "error",
      message: "Could not read the image or document from your device.",
    },
    file_upload_error: {
      severity: "error",
      message: "Document upload failed. Please try again.",
    },
    file_type_unsupported: {
      severity: "error",
      message: "Unsupported file type.",
    },
    file_too_large: {
      severity: "error",
      message: "File is too large (max 20MB).",
    },
    file_empty: {
      severity: "error",
      message: "Empty file — nothing to process.",
    },
    chat_connection: {
      severity: "error",
      message: "Could not reach the AI server. Check backend and network.",
    },
    chat_history_load: {
      severity: "warning",
      message: "Could not load chat history.",
    },
    session_load: {
      severity: "error",
      message: "Could not open this conversation.",
    },
    session_delete: {
      severity: "error",
      message: "Could not delete this conversation.",
    },
    session_persist: {
      severity: "warning",
      message: "Could not save messages to the server.",
    },
    model_unavailable: {
      severity: "error",
      message: "AI model is unavailable on Groq. Check model configuration.",
    },
    moderation_blocked: {
      severity: "warning",
      message: "Request blocked by content moderation.",
    },
    agent_error: {
      severity: "error",
      message: "Could not generate a response. Please try again.",
    },
    generic: {
      severity: "error",
      message: "Something went wrong. Please try again.",
    },
  },
};

function inferCode(input: NotifyInput): NotifyCode {
  if (input.code && input.code in COPY.vi) {
    return input.code as NotifyCode;
  }

  const text = (input.message ?? "").toLowerCase();
  const status = input.status;

  if (status === 429 || text.includes("rate limit") || text.includes("429")) {
    return "groq_rate_limit";
  }
  if (
    status === 401 ||
    text.includes("invalid api key") ||
    text.includes("authentication")
  ) {
    return "groq_auth";
  }
  if (
    text.includes("model_not_found") ||
    text.includes("does not exist") ||
    text.includes("model unavailable")
  ) {
    return "model_unavailable";
  }
  if (text.includes("tavily")) {
    return "tavily_error";
  }
  if (text.includes("unsupported file type")) {
    return "file_type_unsupported";
  }
  if (text.includes("too large") || text.includes("20mb")) {
    return "file_too_large";
  }
  if (text.includes("empty file")) {
    return "file_empty";
  }
  if (text.includes("content moderation") || text.includes("blocked")) {
    return "moderation_blocked";
  }
  if (text.includes("failed to read") || text.includes("filereader")) {
    return "file_read_error";
  }
  if (text.includes("upload")) {
    return "file_upload_error";
  }
  if (text.includes("fetch") || text.includes("network") || text.includes("connection")) {
    return "chat_connection";
  }

  return "generic";
}

export function resolveNotifyMessage(
  input: NotifyInput,
  language: AppLanguage,
): { severity: NotifySeverity; message: string; code: NotifyCode } {
  const code = inferCode(input);
  const entry = COPY[language][code];
  const fallback = input.message?.trim() || entry.message;
  return {
    code,
    severity: entry.severity,
    message: code !== "generic" ? entry.message : fallback,
  };
}

export function resolveUploadError(
  detail: string,
  language: AppLanguage,
): { severity: NotifySeverity; message: string } {
  return resolveNotifyMessage({ message: detail }, language);
}
