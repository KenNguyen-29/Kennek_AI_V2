"use client";

import { fetchEventSource } from "@microsoft/fetch-event-source";
import {
  Bot,
  FileSpreadsheet,
  FileText,
  ImageIcon,
  LoaderCircle,
  LogIn,
  LogOut,
  MessageSquare,
  Paperclip,
  Plus,
  SendHorizontal,
  Trash2,
  User,
  X,
} from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import {
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ThemeToggle } from "../theme/theme-toggle";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
const CHAT_ENDPOINT = `${API_BASE}/api/chat/stream`;
const UPLOAD_ENDPOINT = `${API_BASE}/api/documents/upload`;

const ACCEPTED_FILE_TYPES = [
  ".txt",
  ".md",
  ".log",
  ".pdf",
  ".docx",
  ".doc",
  ".csv",
  ".xlsx",
  ".xls",
  ".json",
  ".xml",
  ".yaml",
  ".yml",
  ".py",
  ".js",
  ".html",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
].join(",");

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type ChatAttachmentPayload = {
  filename: string;
  mime_type: string;
  content_base64: string;
  kind: "image";
};

function isImageFile(file: File): boolean {
  return (
    file.type.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const base64 = result.includes(",") ? result.split(",", 2)[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function PendingFileChip({
  file,
  onRemove,
}: {
  file: File;
  onRemove: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImageFile(file)) {
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="clip-chamfer-sm flex items-center gap-2 border border-kennek-steel bg-kennek-panel px-3 py-1.5 text-xs text-kennek-mist">
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt={file.name}
          className="clip-chamfer-avatar h-7 w-7 object-cover"
        />
      ) : null}
      <span className="max-w-[180px] truncate font-mono">{file.name}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Xóa ${file.name}`}
        className="p-0.5 text-kennek-ash transition hover:text-kennek-orange"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
    </div>
  );
}

const QUICK_TASKS = [
  {
    id: "pdf",
    title: "Phân tích PDF",
    description: "Trích xuất & tóm tắt tài liệu kỹ thuật",
    prompt:
      "Hướng dẫn tôi phân tích một file PDF vừa upload: tóm tắt cấu trúc, điểm chính và các số liệu quan trọng.",
    icon: FileText,
  },
  {
    id: "excel",
    title: "Lập bảng Excel",
    description: "Chuyển dữ liệu thô thành bảng có cấu trúc",
    prompt:
      "Hãy giúp tôi lập bảng Excel từ dữ liệu mô tả. Đề xuất cột, công thức và cách trình bày rõ ràng.",
    icon: FileSpreadsheet,
  },
  {
    id: "vision",
    title: "Mô tả Hình ảnh",
    description: "OCR / đọc UI / phân tích screenshot",
    prompt:
      "Tôi sẽ dán ảnh (Ctrl+V). Hãy sẵn sàng phân tích hình ảnh: mô tả nội dung, đọc chữ trên ảnh và chỉ ra điểm cần chú ý.",
    icon: ImageIcon,
  },
] as const;

type ChatSessionSummary = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type ServerEvent = {
  type: "token" | "status" | "error";
  content: string;
};

function createMessage(role: ChatRole, content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
  };
}

function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ children, ...props }) => (
          <a
            {...props}
            className="text-kennek-orange underline decoration-kennek-orange/40 underline-offset-4 hover:text-[#ff8a33]"
            rel="noreferrer"
            target="_blank"
          >
            {children}
          </a>
        ),
        code: ({ children, className, ...props }) => {
          const isCodeBlock = className?.startsWith("language-");

          return (
            <code
              {...props}
              className={
                isCodeBlock
                  ? `${className} block min-w-full font-mono text-sm leading-6 text-kennek-mist`
                  : "bg-kennek-black/80 px-1.5 py-0.5 font-mono text-[0.9em] text-kennek-orange"
              }
            >
              {children}
            </code>
          );
        },
        h1: ({ children }) => (
          <h1 className="mb-3 mt-5 text-2xl font-semibold text-kennek-ink">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-3 mt-5 text-xl font-semibold text-kennek-ink">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-2 mt-4 text-lg font-semibold text-kennek-ink">
            {children}
          </h3>
        ),
        li: ({ children }) => <li className="ml-5 list-disc">{children}</li>,
        ol: ({ children }) => (
          <ol className="my-3 space-y-1 [&>li]:list-decimal">{children}</ol>
        ),
        p: ({ children }) => (
          <p className="my-2 leading-7 first:mt-0 last:mb-0">{children}</p>
        ),
        pre: ({ children }) => (
          <pre className="my-4 overflow-x-auto rounded-xl border border-white/10 bg-slate-950 p-4 shadow-inner">
            {children}
          </pre>
        ),
        ul: ({ children }) => <ul className="my-3 space-y-1">{children}</ul>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export function Chat() {
  const { data: session, status: authStatus } = useSession();
  const userEmail = session?.user?.email ?? null;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: isStreaming ? "auto" : "smooth",
    });
  }, [isStreaming, messages, status]);

  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
    },
    [],
  );

  const fetchHistory = useCallback(async (email: string) => {
    setIsLoadingHistory(true);
    try {
      const response = await fetch(
        `${API_BASE}/api/chat/history/${encodeURIComponent(email)}`,
      );
      if (!response.ok) {
        throw new Error(`Failed to load history (${response.status})`);
      }
      const data = (await response.json()) as ChatSessionSummary[];
      setSessions(data);
    } catch (error) {
      console.error("Unable to load chat history", error);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (!userEmail) {
      setSessions([]);
      return;
    }
    void fetchHistory(userEmail);
  }, [fetchHistory, userEmail]);

  const appendAssistantToken = (assistantId: string, token: string) => {
    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === assistantId
          ? { ...message, content: message.content + token }
          : message,
      ),
    );
  };

  const persistTurn = async (
    userMessage: ChatMessage,
    assistantContent: string,
  ) => {
    if (!userEmail || !assistantContent.trim()) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/chat/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_email: userEmail,
          name: session?.user?.name ?? null,
          avatar_url: session?.user?.image ?? null,
          session_id: activeSessionIdRef.current,
          title: userMessage.content.slice(0, 80),
          messages: [
            { role: "user", content: userMessage.content },
            { role: "assistant", content: assistantContent },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to persist chat (${response.status})`);
      }

      const data = (await response.json()) as {
        session_id: string;
        title: string;
      };
      setActiveSessionId(data.session_id);
      activeSessionIdRef.current = data.session_id;
      await fetchHistory(userEmail);
    } catch (error) {
      console.error("Unable to persist chat history", error);
    }
  };

  const loadSession = async (sessionId: string) => {
    if (!userEmail || isStreaming) {
      return;
    }

    abortControllerRef.current?.abort();
    setStatus(null);

    try {
      const response = await fetch(
        `${API_BASE}/api/chat/sessions/${sessionId}?user_email=${encodeURIComponent(userEmail)}`,
      );
      if (!response.ok) {
        throw new Error(`Failed to load session (${response.status})`);
      }

      const data = (await response.json()) as {
        id: string;
        title: string;
        messages: Array<{ id: string; role: string; content: string }>;
      };

      setActiveSessionId(data.id);
      setMessages(
        data.messages
          .filter(
            (
              message,
            ): message is { id: string; role: ChatRole; content: string } =>
              message.role === "user" || message.role === "assistant",
          )
          .map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
          })),
      );
    } catch (error) {
      console.error("Unable to load chat session", error);
    }
  };

  const deleteSession = async (sessionId: string) => {
    if (!userEmail) {
      return;
    }

    setIsDeletingSession(true);
    try {
      const response = await fetch(
        `${API_BASE}/api/chat/sessions/${sessionId}?user_email=${encodeURIComponent(userEmail)}`,
        { method: "DELETE" },
      );
      if (!response.ok && response.status !== 204) {
        throw new Error(`Failed to delete session (${response.status})`);
      }

      setSessions((current) =>
        current.filter((session) => session.id !== sessionId),
      );

      if (activeSessionId === sessionId || activeSessionIdRef.current === sessionId) {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        setMessages([]);
        setActiveSessionId(null);
        activeSessionIdRef.current = null;
        setInput("");
        setPendingFiles([]);
        setStatus(null);
        setIsStreaming(false);
        setIsUploading(false);
      }
      setSessionToDelete(null);
    } catch (error) {
      console.error("Unable to delete chat session", error);
    } finally {
      setIsDeletingSession(false);
    }
  };

  const uploadPendingFiles = async (
    filesToUpload: File[],
  ): Promise<string | null> => {
    if (filesToUpload.length === 0) {
      return null;
    }

    setIsUploading(true);
    setStatus("Đang nạp tài liệu vào kho tri thức...");

    try {
      const formData = new FormData();
      filesToUpload.forEach((file) => formData.append("files", file));

      const response = await fetch(UPLOAD_ENDPOINT, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as {
          detail?: string;
        } | null;
        throw new Error(
          errorBody?.detail ?? `Upload failed (${response.status})`,
        );
      }

      const data = (await response.json()) as {
        files: string[];
        chunk_count: number;
        message: string;
      };

      const summary =
        `Đã tiếp nhận ${data.files.length} file: ${data.files.join(", ")}. ` +
        `Nạp ${data.chunk_count} đoạn vào kho tri thức. ` +
        "Bạn có thể hỏi về nội dung các file này.";

      setMessages((current) => [
        ...current,
        createMessage("assistant", summary),
      ]);
      return summary;
    } catch (error) {
      console.error("Unable to upload documents", error);
      const message =
        error instanceof Error
          ? error.message
          : "Không thể upload tài liệu.";
      setMessages((current) => [
        ...current,
        createMessage("assistant", `**Lỗi upload:** ${message}`),
      ]);
      return null;
    } finally {
      setIsUploading(false);
      setStatus(null);
    }
  };

  const addPendingFiles = (selected: File[]) => {
    if (selected.length === 0) {
      return;
    }
    setPendingFiles((current) => {
      const existing = new Set(
        current.map((file) => `${file.name}-${file.size}-${file.lastModified}`),
      );
      const next = selected.filter(
        (file) =>
          !existing.has(`${file.name}-${file.size}-${file.lastModified}`),
      );
      return [...current, ...next];
    });
  };

  const handleFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    addPendingFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = event.clipboardData?.items;
    if (!items?.length) {
      return;
    }

    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (!item.type.startsWith("image/")) {
        continue;
      }
      const blob = item.getAsFile();
      if (!blob) {
        continue;
      }
      const extension = blob.type.split("/")[1] || "png";
      const filename =
        blob.name && blob.name !== "image.png"
          ? blob.name
          : `screenshot-${Date.now()}.${extension}`;
      imageFiles.push(
        new File([blob], filename, {
          type: blob.type || "image/png",
          lastModified: Date.now(),
        }),
      );
    }

    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    addPendingFiles(imageFiles);
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((current) => current.filter((_, i) => i !== index));
  };

  const submitMessage = async (
    event?: FormEvent,
    overrideText?: string,
  ) => {
    event?.preventDefault();

    const query = (overrideText ?? input).trim();
    if ((!query && pendingFiles.length === 0) || isStreaming || isUploading) {
      return;
    }

    const imageFiles = pendingFiles.filter(isImageFile);
    const documentFiles = pendingFiles.filter((file) => !isImageFile(file));

    if (documentFiles.length > 0) {
      const uploadSummary = await uploadPendingFiles(documentFiles);
      if (!uploadSummary) {
        return;
      }
      if (!query && imageFiles.length === 0) {
        setPendingFiles([]);
        return;
      }
    }

    let attachments: ChatAttachmentPayload[] = [];
    if (imageFiles.length > 0) {
      try {
        setStatus("Đang chuẩn bị ảnh...");
        attachments = await Promise.all(
          imageFiles.map(async (file) => ({
            filename: file.name,
            mime_type: file.type || "image/png",
            content_base64: await fileToBase64(file),
            kind: "image" as const,
          })),
        );
      } catch (error) {
        console.error("Unable to encode image attachments", error);
        setMessages((current) => [
          ...current,
          createMessage(
            "assistant",
            "**Lỗi:** Không đọc được ảnh từ clipboard/file.",
          ),
        ]);
        setStatus(null);
        return;
      }
    }

    const messageText =
      query ||
      (attachments.length > 0 ? "Hãy phân tích ảnh đính kèm." : "");

    setPendingFiles([]);

    const previousMessages = messages;
    const userMessage = createMessage(
      "user",
      attachments.length > 0
        ? `${messageText}\n\n[Đính kèm ${attachments.length} ảnh]`
        : messageText,
    );
    const assistantMessage = createMessage("assistant", "");
    const controller = new AbortController();
    const streamSessionId = activeSessionIdRef.current;
    let assistantContent = "";

    abortControllerRef.current = controller;
    setInput("");
    setStatus(null);
    setIsStreaming(true);
    setMessages((current) => [...current, userMessage, assistantMessage]);

    try {
      await fetchEventSource(CHAT_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: messageText,
          session_id: streamSessionId,
          history: previousMessages.map(({ role, content }) => ({
            role,
            content,
          })),
          attachments,
        }),
        signal: controller.signal,
        openWhenHidden: true,
        async onopen(response) {
          if (!response.ok) {
            throw new Error(
              `Chat request failed with status ${response.status}`,
            );
          }
        },
        onmessage(eventMessage) {
          if (!eventMessage.data) {
            return;
          }

          const streamEvent = JSON.parse(eventMessage.data) as ServerEvent;

          if (streamEvent.type === "status") {
            setStatus(streamEvent.content || "Đang xử lý...");
            return;
          }

          if (streamEvent.type === "token") {
            setStatus(null);
            assistantContent += streamEvent.content;
            appendAssistantToken(assistantMessage.id, streamEvent.content);
            return;
          }

          if (streamEvent.type === "error") {
            setStatus(null);
            const errorText = `\n\n**Lỗi:** ${streamEvent.content}`;
            assistantContent += errorText;
            appendAssistantToken(assistantMessage.id, errorText);
          }
        },
        onerror(error) {
          throw error;
        },
      });

      if (!controller.signal.aborted) {
        if (streamSessionId) {
          if (userEmail) {
            await fetchHistory(userEmail);
          }
        } else {
          await persistTurn(userMessage, assistantContent);
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error("Unable to stream chat response", error);
        setStatus(null);
        appendAssistantToken(
          assistantMessage.id,
          "\n\n**Không thể kết nối tới máy chủ AI.** Hãy kiểm tra FastAPI tại `localhost:8000`.",
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
    }
  };

  const startNewChat = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setMessages([]);
    setActiveSessionId(null);
    activeSessionIdRef.current = null;
    setInput("");
    setPendingFiles([]);
    setStatus(null);
    setIsStreaming(false);
    setIsUploading(false);
  };

  const runQuickTask = (prompt: string) => {
    if (isStreaming || isUploading) {
      return;
    }
    setInput(prompt);
    void submitMessage(undefined, prompt);
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-kennek-charcoal text-foreground">
      {/* Sidebar — industrial rail + charcoal panels */}
      <aside className="relative hidden w-72 shrink-0 flex-col bg-kennek-black md:flex">
        <div className="kennek-rail absolute inset-y-0 right-0 w-[3px]" aria-hidden />
        <div
          className="pointer-events-none absolute inset-y-0 right-[5px] w-px bg-kennek-orange/35"
          aria-hidden
        />

        <div className="flex h-16 items-center gap-3 border-b border-kennek-steel/80 px-5">
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
            <p className="font-semibold tracking-wide text-kennek-ink">Kennek AI</p>
            <p className="kennek-label mt-0.5">Command Center</p>
          </div>
        </div>

        <div className="p-3">
          <button
            type="button"
            onClick={startNewChat}
            className="group kennek-frame w-full kennek-frame-active"
          >
            <span className="kennek-frame-inner flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold text-kennek-mist transition group-hover:bg-kennek-steel/40 group-hover:text-kennek-ink">
              <Plus className="h-4 w-4 text-kennek-orange" strokeWidth={2.5} />
              Cuộc trò chuyện mới
            </span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {authStatus === "loading" ? (
            <div className="flex items-center gap-2 px-3 py-4 text-sm text-kennek-ash">
              <LoaderCircle className="h-4 w-4 animate-spin text-kennek-orange" />
              Đang tải...
            </div>
          ) : !userEmail ? (
            <div className="space-y-3 px-1 py-2">
              <p className="px-2 text-sm text-kennek-ash">
                Đăng nhập để lưu và xem lịch sử hội thoại.
              </p>
              <Link href="/auth/signin" className="kennek-frame block w-full">
                <span className="kennek-frame-inner flex w-full items-center justify-center gap-2 bg-kennek-orange px-4 py-2.5 text-sm font-bold text-kennek-black transition hover:brightness-110">
                  <LogIn className="h-4 w-4" strokeWidth={2.5} />
                  Đăng nhập
                </span>
              </Link>
            </div>
          ) : isLoadingHistory ? (
            <div className="flex items-center gap-2 px-3 py-4 text-sm text-kennek-ash">
              <LoaderCircle className="h-4 w-4 animate-spin text-kennek-orange" />
              Đang tải...
            </div>
          ) : sessions.length > 0 ? (
            <div className="space-y-1">
              {sessions.map((chatSession) => (
                <div
                  key={chatSession.id}
                  className={`group flex w-full items-center gap-1 clip-chamfer-sm pr-1 text-sm transition ${
                    activeSessionId === chatSession.id
                      ? "bg-kennek-orange/15 text-kennek-ink ring-1 ring-inset ring-kennek-orange/50"
                      : "text-kennek-mist hover:bg-kennek-panel hover:text-kennek-ink"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => void loadSession(chatSession.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left"
                  >
                    <MessageSquare
                      className={`h-4 w-4 shrink-0 ${
                        activeSessionId === chatSession.id
                          ? "text-kennek-orange"
                          : "text-kennek-ash"
                      }`}
                      strokeWidth={2.25}
                    />
                    <span className="truncate">{chatSession.title}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSessionToDelete({
                        id: chatSession.id,
                        title: chatSession.title,
                      });
                    }}
                    aria-label={`Xóa ${chatSession.title}`}
                    className="shrink-0 p-2 text-kennek-ash opacity-0 transition hover:text-kennek-orange group-hover:opacity-100 focus:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2.4} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-3 py-4 font-mono text-xs text-kennek-ash">
              // chưa có session
            </p>
          )}
        </div>

        <div className="border-t border-kennek-steel/80 p-3">
          {userEmail ? (
            <div className="kennek-frame">
              <div className="kennek-frame-inner flex items-center gap-3 px-3 py-2.5">
                <div className="clip-chamfer-avatar relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden bg-kennek-steel">
                  {session?.user?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={session.user.image}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <User className="h-4 w-4 text-kennek-orange" strokeWidth={2.5} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-kennek-ink">
                    {session?.user?.name ?? "Operator"}
                  </p>
                  <p className="truncate font-mono text-[10px] text-kennek-ash">
                    {userEmail}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void signOut({ callbackUrl: "/auth/signin" })}
                  aria-label="Đăng xuất"
                  className="p-2 text-kennek-ash transition hover:text-kennek-orange"
                >
                  <LogOut className="h-4 w-4" strokeWidth={2.5} />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void signIn(undefined, { callbackUrl: "/" })}
              className="kennek-frame w-full"
            >
              <span className="kennek-frame-inner flex w-full items-center justify-center gap-2 px-4 py-2.5 text-sm text-kennek-mist transition hover:text-kennek-orange">
                <LogIn className="h-4 w-4" strokeWidth={2.5} />
                Đăng nhập
              </span>
            </button>
          )}
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col bg-kennek-charcoal">
        <div className="pointer-events-none absolute inset-0 kennek-grid opacity-40" />

        <header className="relative z-10 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-kennek-steel/70 bg-kennek-charcoal/90 px-5 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            <div className="clip-chamfer-sm flex h-9 w-9 items-center justify-center bg-kennek-panel ring-1 ring-kennek-orange/40">
              <Bot className="h-4 w-4 text-kennek-orange" strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold tracking-wide text-kennek-ink">
                Analytics Command Center
              </h1>
              <p className="flex items-center gap-2 font-mono text-[11px] text-kennek-ash">
                <span className="inline-block h-1.5 w-1.5 bg-kennek-orange shadow-[0_0_8px_var(--kennek-orange)]" />
                SYSTEM ONLINE
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <Link href="/auth/signin" className="kennek-frame md:hidden">
              <span className="kennek-frame-inner px-3 py-1.5 text-xs text-kennek-mist">
                Đăng nhập
              </span>
            </Link>
          </div>
        </header>

        <div className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 pb-44 pt-6 sm:px-6">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
            {messages.length === 0 ? (
              <div className="flex min-h-[58vh] flex-col items-center justify-center">
                <div className="mb-8 flex flex-col items-center text-center">
                  <p className="kennek-label mb-3">Kennek AI</p>
                  <h2 className="vi-safe px-2 text-2xl font-semibold tracking-normal text-kennek-ink sm:text-3xl">
                    Bạn muốn bắt đầu từ đâu?
                  </h2>
                  <p className="mt-3 max-w-lg text-sm leading-6 text-kennek-mist">
                    Chọn tác vụ nhanh bên dưới, hoặc nhập lệnh / dán ảnh
                    (Ctrl+V) để bắt đầu.
                  </p>
                </div>

                <div className="grid w-full max-w-3xl gap-3 sm:grid-cols-3">
                  {QUICK_TASKS.map((task) => {
                    const Icon = task.icon;
                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => runQuickTask(task.prompt)}
                        disabled={isStreaming || isUploading}
                        className="group kennek-frame text-left disabled:opacity-50"
                      >
                        <span className="kennek-frame-inner block h-full bg-kennek-panel p-4 transition group-hover:bg-kennek-steel/30">
                          <span className="mb-4 flex h-10 w-10 items-center justify-center clip-chamfer-sm bg-kennek-black ring-1 ring-kennek-orange/40">
                            <Icon
                              className="h-5 w-5 text-kennek-orange"
                              strokeWidth={2.4}
                            />
                          </span>
                          <span className="block text-sm font-semibold text-kennek-ink">
                            {task.title}
                          </span>
                          <span className="mt-1.5 block text-xs leading-5 text-kennek-ash">
                            {task.description}
                          </span>
                          <span className="mt-4 block font-mono text-[10px] uppercase tracking-[0.18em] text-kennek-orange/80">
                            Execute →
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex items-start gap-3 ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.role === "assistant" && (
                    <div className="clip-chamfer-avatar mt-1 flex h-8 w-8 shrink-0 items-center justify-center bg-kennek-panel ring-1 ring-kennek-orange/35">
                      <Bot className="h-4 w-4 text-kennek-orange" strokeWidth={2.5} />
                    </div>
                  )}

                  {message.content && (
                    <div
                      className={`max-w-[85%] text-sm sm:max-w-[75%] ${
                        message.role === "user"
                          ? "clip-chamfer bg-kennek-orange px-4 py-3 text-kennek-black"
                          : "kennek-frame"
                      }`}
                    >
                      {message.role === "user" ? (
                        <p className="whitespace-pre-wrap font-medium leading-6">
                          {message.content}
                        </p>
                      ) : (
                        <div className="kennek-frame-inner px-4 py-3 text-kennek-mist">
                          <MarkdownMessage content={message.content} />
                        </div>
                      )}
                    </div>
                  )}

                  {message.role === "user" && (
                    <div className="clip-chamfer-avatar mt-1 flex h-8 w-8 shrink-0 items-center justify-center bg-kennek-steel">
                      <User className="h-4 w-4 text-kennek-orange" strokeWidth={2.5} />
                    </div>
                  )}
                </div>
              ))
            )}

            {status && (
              <div className="flex items-center gap-3 pl-11 font-mono text-sm text-kennek-orange">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                <span>{status}</span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-kennek-charcoal via-kennek-charcoal to-transparent px-4 pb-5 pt-12 sm:px-6">
          {pendingFiles.length > 0 && (
            <div className="mx-auto mb-3 flex max-w-4xl flex-wrap gap-2">
              {pendingFiles.map((file, index) => (
                <PendingFileChip
                  key={`${file.name}-${file.lastModified}-${index}`}
                  file={file}
                  onRemove={() => removePendingFile(index)}
                />
              ))}
            </div>
          )}

          <form
            onSubmit={submitMessage}
            className="kennek-frame mx-auto max-w-4xl kennek-frame-active focus-within:brightness-110"
          >
            <div className="kennek-frame-inner flex items-end gap-2 bg-kennek-panel p-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_FILE_TYPES}
                className="hidden"
                onChange={handleFileSelection}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isStreaming || isUploading}
                aria-label="Đính kèm tài liệu"
                className="clip-chamfer-sm flex h-11 w-11 shrink-0 items-center justify-center bg-kennek-black text-kennek-mist ring-1 ring-kennek-steel transition hover:text-kennek-orange hover:ring-kennek-orange/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Paperclip className="h-5 w-5" strokeWidth={2.4} />
              </button>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                rows={1}
                placeholder="Nhập lệnh phân tích · Ctrl+V dán ảnh · đính kèm file..."
                disabled={isStreaming || isUploading}
                className="max-h-36 min-h-11 flex-1 resize-none bg-transparent px-3 py-3 text-sm leading-5 text-kennek-ink outline-none placeholder:text-kennek-ash disabled:cursor-not-allowed"
              />
              <button
                type="submit"
                disabled={
                  (!input.trim() && pendingFiles.length === 0) ||
                  isStreaming ||
                  isUploading
                }
                aria-label="Gửi tin nhắn"
                className="clip-chamfer-sm flex h-11 w-11 shrink-0 items-center justify-center bg-kennek-orange text-kennek-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-kennek-steel disabled:text-kennek-ash"
              >
                {isStreaming || isUploading ? (
                  <LoaderCircle className="h-5 w-5 animate-spin" strokeWidth={2.5} />
                ) : (
                  <SendHorizontal className="h-5 w-5" strokeWidth={2.5} />
                )}
              </button>
            </div>
          </form>
          <p className="mx-auto mt-2 max-w-4xl text-center font-mono text-[10px] uppercase tracking-[0.16em] text-kennek-ash">
            Enter gửi · Ctrl+V ảnh · PDF / DOCX / Excel / Vision
          </p>
        </div>
      </main>

      {sessionToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-kennek-overlay px-4 backdrop-blur-sm"
          role="presentation"
          onClick={() => {
            if (!isDeletingSession) {
              setSessionToDelete(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-session-title"
            className="kennek-frame w-full max-w-md kennek-frame-active"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="kennek-frame-inner bg-kennek-panel p-6">
              <p className="kennek-label mb-3">Confirm Delete</p>
              <h2
                id="delete-session-title"
                className="text-lg font-semibold text-kennek-ink"
              >
                Bạn có chắc chắn muốn xoá?
              </h2>
              <p className="mt-2 text-sm leading-6 text-kennek-mist">
                Cuộc trò chuyện{" "}
                <span className="font-medium text-kennek-orange">
                  “{sessionToDelete.title}”
                </span>{" "}
                sẽ bị xoá vĩnh viễn và không thể khôi phục.
              </p>

              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isDeletingSession}
                  onClick={() => setSessionToDelete(null)}
                  className="kennek-frame"
                >
                  <span className="kennek-frame-inner px-4 py-2.5 text-sm text-kennek-mist transition hover:text-kennek-ink">
                    Huỷ
                  </span>
                </button>
                <button
                  type="button"
                  disabled={isDeletingSession}
                  onClick={() => void deleteSession(sessionToDelete.id)}
                  className="kennek-frame"
                >
                  <span className="kennek-frame-inner flex items-center gap-2 bg-kennek-orange px-4 py-2.5 text-sm font-bold text-kennek-black transition hover:brightness-110 disabled:opacity-60">
                    {isDeletingSession ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" strokeWidth={2.5} />
                    )}
                    Xác nhận xoá
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
