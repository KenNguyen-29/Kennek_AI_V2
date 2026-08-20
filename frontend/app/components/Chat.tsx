"use client";

import { fetchEventSource } from "@microsoft/fetch-event-source";
import {
  Bot,
  FileSpreadsheet,
  FileText,
  ImageIcon,
  LoaderCircle,
  Menu,
  Settings2,
  Trash2,
  User,
  X,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  isActiveChatCommand,
  type ActiveChatCommand,
} from "../lib/chat-commands";
import { getChatCopy, useAppLanguage } from "../lib/i18n";
import { createId } from "../lib/id";
import { resolveNotifyMessage, type NotifyInput } from "../lib/notify-errors";
import {
  DEFAULT_PROMPT_MODE,
  type PromptMode,
} from "../lib/prompt-modes";
import { loadSettings } from "../lib/settings-storage";
import { ThemeToggle } from "../theme/theme-toggle";
import { ChatInput } from "./ChatInput";
import { ChatSidebar } from "./Sidebar";
import { useToast } from "./ToastProvider";

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
  command?: ActiveChatCommand | null;
  promptMode?: PromptMode | null;
};

type ChatAttachmentPayload = {
  filename: string;
  mime_type: string;
  content_base64: string;
  kind: "image";
};

const QUICK_TASK_ICONS = {
  pdf: FileText,
  excel: FileSpreadsheet,
  vision: ImageIcon,
} as const;

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
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function PendingFileChip({
  file,
  onRemove,
  removeLabel,
}: {
  file: File;
  onRemove: () => void;
  removeLabel: string;
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
        aria-label={removeLabel}
        className="p-0.5 text-kennek-ash transition hover:text-kennek-orange"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
    </div>
  );
}

type ChatSessionSummary = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type ServerEvent = {
  type: "token" | "status" | "error" | "notice";
  content: string;
  code?: string;
};

function createMessage(
  role: ChatRole,
  content: string,
  command?: ActiveChatCommand | null,
  promptMode?: PromptMode | null,
): ChatMessage {
  return {
    id: createId(),
    role,
    content,
    command: command ?? null,
    promptMode: promptMode ?? null,
  };
}

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="assistant-prose text-[15px] leading-7 text-kennek-ink">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, ...props }) => (
            <a
              {...props}
              className="font-medium text-kennek-orange underline decoration-kennek-orange/35 underline-offset-4 transition hover:text-[#ff8a33]"
              rel="noreferrer"
              target="_blank"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-2 border-kennek-orange/70 bg-kennek-black/25 py-2 pl-4 pr-3 text-kennek-mist">
              {children}
            </blockquote>
          ),
          code: ({ children, className, ...props }) => {
            const isCodeBlock = className?.startsWith("language-");

            return (
              <code
                {...props}
                className={
                  isCodeBlock
                    ? `${className} block min-w-full font-mono text-[13px] leading-6 text-kennek-mist`
                    : "rounded-sm bg-kennek-black/70 px-1.5 py-0.5 font-mono text-[0.86em] text-kennek-orange"
                }
              >
                {children}
              </code>
            );
          },
          h1: ({ children }) => (
            <h1 className="mb-3 mt-1 border-b border-kennek-steel/40 pb-2 text-xl font-semibold tracking-tight text-kennek-ink first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2.5 mt-5 text-lg font-semibold tracking-tight text-kennek-ink first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-4 text-base font-semibold text-kennek-ink first:mt-0">
              {children}
            </h3>
          ),
          hr: () => <hr className="my-5 border-kennek-steel/50" />,
          li: ({ children }) => (
            <li className="leading-7 marker:text-kennek-orange">{children}</li>
          ),
          ol: ({ children }) => (
            <ol className="my-3 list-decimal space-y-1.5 pl-5">{children}</ol>
          ),
          p: ({ children }) => (
            <p className="my-2.5 leading-7 text-kennek-ink/95 first:mt-0 last:mb-0">
              {children}
            </p>
          ),
          pre: ({ children }) => (
            <pre className="my-4 overflow-x-auto border border-kennek-steel/60 bg-kennek-black/80 p-4 clip-chamfer-sm">
              {children}
            </pre>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-kennek-ink">{children}</strong>
          ),
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto border border-kennek-steel/50">
              <table className="w-full min-w-[320px] border-collapse text-left text-sm">
                {children}
              </table>
            </div>
          ),
          tbody: ({ children }) => <tbody>{children}</tbody>,
          td: ({ children }) => (
            <td className="border-t border-kennek-steel/40 px-3 py-2 align-top text-kennek-mist">
              {children}
            </td>
          ),
          th: ({ children }) => (
            <th className="bg-kennek-black/40 px-3 py-2 font-semibold text-kennek-ink">
              {children}
            </th>
          ),
          thead: ({ children }) => <thead>{children}</thead>,
          tr: ({ children }) => <tr className="even:bg-kennek-black/15">{children}</tr>,
          ul: ({ children }) => (
            <ul className="my-3 list-disc space-y-1.5 pl-5">{children}</ul>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function Chat() {
  const router = useRouter();
  const language = useAppLanguage();
  const t = getChatCopy(language);
  const { showToast } = useToast();
  const { data: session, status: authStatus } = useSession();
  const userEmail = session?.user?.email ?? null;

  const notify = useCallback(
    (input: NotifyInput) => {
      const resolved = resolveNotifyMessage(input, language);
      showToast({ type: resolved.severity, message: resolved.message });
      return resolved.message;
    },
    [language, showToast],
  );

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [activeCommand, setActiveCommand] = useState<ActiveChatCommand | null>(
    null,
  );
  const [promptMode, setPromptMode] =
    useState<PromptMode>(DEFAULT_PROMPT_MODE);
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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
      notify({ code: "chat_history_load" });
    } finally {
      setIsLoadingHistory(false);
    }
  }, [notify]);

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
      notify({ code: "session_persist" });
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
      notify({ code: "session_load" });
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
      notify({ code: "session_delete" });
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
    setStatus(t.uploadingDocs);

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

      const summary = t.uploadSummary(
        data.files.join(", "),
        data.chunk_count,
      );

      setMessages((current) => [
        ...current,
        createMessage("assistant", summary),
      ]);
      return summary;
    } catch (error) {
      console.error("Unable to upload documents", error);
      const detail =
        error instanceof Error ? error.message : t.uploadFailed;
      notify({ message: detail });
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
    overrideCommand?: ActiveChatCommand | null,
  ) => {
    event?.preventDefault();

    const query = (overrideText ?? input).trim();
    if ((!query && pendingFiles.length === 0) || isStreaming || isUploading) {
      return;
    }

    const commandForTurn =
      overrideCommand !== undefined ? overrideCommand : activeCommand;
    const modeForTurn = promptMode;

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
        setStatus(t.preparingImage);
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
        notify({ code: "file_read_error" });
        setStatus(null);
        return;
      }
    }

    const messageText =
      query || (attachments.length > 0 ? t.analyzeAttachment : "");

    setPendingFiles([]);

    const previousMessages = messages;
    const userMessage = createMessage(
      "user",
      attachments.length > 0
        ? `${messageText}\n\n${t.attachedImages(attachments.length)}`
        : messageText,
      commandForTurn,
      modeForTurn === "auto" ? null : modeForTurn,
    );
    const assistantMessage = createMessage("assistant", "");
    const controller = new AbortController();
    const streamSessionId = activeSessionIdRef.current;
    let assistantContent = "";

    abortControllerRef.current = controller;
    setInput("");
    setActiveCommand(null);
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
          temperature: loadSettings().models.temperature,
          active_command: commandForTurn,
          prompt_mode: modeForTurn,
        }),
        signal: controller.signal,
        openWhenHidden: true,
        async onopen(response) {
          if (!response.ok) {
            const err = new Error(
              `Chat request failed with status ${response.status}`,
            ) as Error & { status?: number };
            err.status = response.status;
            throw err;
          }
        },
        onmessage(eventMessage) {
          if (!eventMessage.data) {
            return;
          }

          const streamEvent = JSON.parse(eventMessage.data) as ServerEvent;

          if (streamEvent.type === "status") {
            setStatus(streamEvent.content || t.processing);
            return;
          }

          if (streamEvent.type === "notice") {
            notify({
              code: streamEvent.code,
              message: streamEvent.content,
            });
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
            const errorMessage = notify({
              code: streamEvent.code,
              message: streamEvent.content,
            });
            assistantContent += errorMessage;
            appendAssistantToken(assistantMessage.id, errorMessage);
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
        const status =
          error instanceof Error && "status" in error
            ? Number((error as Error & { status?: number }).status)
            : undefined;
        const errorMessage = notify({
          code: "chat_connection",
          status: Number.isFinite(status) ? status : undefined,
          message: error instanceof Error ? error.message : undefined,
        });
        appendAssistantToken(assistantMessage.id, errorMessage);
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    }
  };

  const startNewChat = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setMessages([]);
    setActiveSessionId(null);
    activeSessionIdRef.current = null;
    setInput("");
    setActiveCommand(null);
    setPendingFiles([]);
    setStatus(null);
    setIsStreaming(false);
    setIsUploading(false);
  };

  const runQuickTask = (prompt: string, command?: ActiveChatCommand) => {
    if (isStreaming || isUploading) {
      return;
    }
    if (command) {
      setActiveCommand(command);
    }
    setInput(prompt);
    void submitMessage(undefined, prompt, command ?? null);
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-kennek-charcoal text-foreground">
      <ChatSidebar
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        authStatus={authStatus}
        userEmail={userEmail}
        userName={session?.user?.name ?? null}
        userImage={session?.user?.image ?? null}
        sessions={sessions}
        activeSessionId={activeSessionId}
        isLoadingHistory={isLoadingHistory}
        labels={{
          newChat: t.newChat,
          loading: t.loading,
          loginToSave: t.loginToSave,
          login: t.login,
          logout: t.logout,
          noSessions: t.noSessions,
          settings: t.settings,
          deleteSessionAria: t.deleteSessionAria,
        }}
        onNewChat={startNewChat}
        onOpenSettings={() => router.push("/settings")}
        onLoadSession={(id) => void loadSession(id)}
        onRequestDeleteSession={(chatSession) =>
          setSessionToDelete({
            id: chatSession.id,
            title: chatSession.title,
          })
        }
      />

      <main className="relative flex min-w-0 flex-1 flex-col bg-kennek-charcoal">
        <div className="pointer-events-none absolute inset-0 kennek-grid opacity-40" />

        <header className="relative z-10 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-kennek-steel/70 bg-kennek-panel/95 px-3 backdrop-blur sm:px-5 md:h-16">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
              className="clip-chamfer-sm flex h-9 w-9 items-center justify-center bg-kennek-panel text-kennek-orange ring-1 ring-kennek-orange/40 md:hidden"
            >
              <Menu className="h-5 w-5" strokeWidth={2.5} />
            </button>
            <div className="clip-chamfer-sm hidden h-9 w-9 items-center justify-center bg-kennek-panel ring-1 ring-kennek-orange/40 sm:flex">
              <Bot className="h-4 w-4 text-kennek-orange" strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold tracking-wide text-kennek-ink">
                {t.headerTitle}
              </h1>
              <p className="hidden items-center gap-2 font-mono text-[11px] text-kennek-ash sm:flex">
                <span className="inline-block h-1.5 w-1.5 bg-kennek-orange shadow-[0_0_8px_var(--kennek-orange)]" />
                {t.systemOnline}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => router.push("/settings")}
              aria-label={t.settings}
              className="kennek-frame lg:hidden"
            >
              <span className="kennek-frame-inner flex h-9 w-9 items-center justify-center text-kennek-mist">
                <Settings2 className="h-4 w-4" strokeWidth={2.5} />
              </span>
            </button>
          </div>
        </header>

        <div className="relative z-10 min-h-0 flex-1 overflow-y-auto px-3 pb-36 pt-4 sm:px-6 sm:pb-44 sm:pt-6">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 sm:gap-6">
            {messages.length === 0 ? (
              <div className="flex min-h-[52vh] flex-col items-center justify-center sm:min-h-[58vh]">
                <div className="mb-6 flex flex-col items-center text-center sm:mb-8">
                  <p className="kennek-label mb-2 sm:mb-3">Kennek AI</p>
                  <h2 className="vi-safe px-2 text-2xl font-bold tracking-normal text-kennek-ink sm:text-3xl lg:text-4xl lg:font-extrabold">
                    {t.splashTitle}
                  </h2>
                  <p className="mt-2 max-w-lg px-2 text-sm leading-6 text-kennek-mist sm:mt-3">
                    {t.splashSubtitle}
                  </p>
                </div>

                <div className="grid w-full max-w-4xl grid-cols-1 gap-3 px-1 sm:px-0 md:grid-cols-2 lg:grid-cols-3">
                  {t.quickTasks.map((task) => {
                    const Icon =
                      QUICK_TASK_ICONS[
                        task.id as keyof typeof QUICK_TASK_ICONS
                      ];
                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() =>
                          runQuickTask(
                            task.prompt,
                            isActiveChatCommand(task.id) ? task.id : undefined,
                          )
                        }
                        disabled={isStreaming || isUploading}
                        className="group kennek-frame text-left disabled:opacity-50"
                      >
                        <span className="kennek-frame-inner block h-full bg-kennek-panel p-3 transition group-hover:bg-kennek-steel/30 sm:p-4">
                          <span className="mb-3 flex h-9 w-9 items-center justify-center clip-chamfer-sm bg-kennek-black ring-1 ring-kennek-orange/40 sm:mb-4 sm:h-10 sm:w-10">
                            <Icon
                              className="h-4 w-4 text-kennek-orange sm:h-5 sm:w-5"
                              strokeWidth={2.4}
                            />
                          </span>
                          <span className="block text-sm font-semibold text-kennek-ink">
                            {task.title}
                          </span>
                          <span className="mt-1.5 block text-xs leading-5 text-kennek-ash">
                            {task.description}
                          </span>
                          <span className="mt-3 block font-mono text-[10px] uppercase tracking-[0.18em] text-kennek-orange/80 sm:mt-4">
                            {t.execute}
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
                      className={`relative max-w-[92%] text-sm sm:max-w-[85%] md:max-w-[75%] ${
                        message.role === "user"
                          ? "clip-chamfer bg-kennek-orange px-3 py-2.5 text-kennek-on-accent sm:px-4 sm:py-3"
                          : "kennek-frame"
                      }`}
                    >
                      {message.role === "user" &&
                      (message.command ||
                        (message.promptMode &&
                          message.promptMode !== "auto")) ? (
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {message.command ? (
                            <span className="inline-flex items-center clip-chamfer-sm bg-kennek-on-accent/85 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#FF5500] ring-1 ring-[#FF5500]/50">
                              MODE: @{message.command}
                            </span>
                          ) : null}
                          {message.promptMode &&
                          message.promptMode !== "auto" ? (
                            <span className="inline-flex items-center clip-chamfer-sm bg-kennek-on-accent/85 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#FF5500] ring-1 ring-[#FF5500]/50">
                              {message.promptMode}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
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

        <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-kennek-charcoal via-kennek-charcoal/95 to-transparent px-3 pt-8 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-5 sm:pt-12">
          {pendingFiles.length > 0 && (
            <div className="mx-auto mb-3 flex max-w-4xl flex-wrap gap-2">
              {pendingFiles.map((file, index) => (
                <PendingFileChip
                  key={`${file.name}-${file.lastModified}-${index}`}
                  file={file}
                  removeLabel={t.removeFile(file.name)}
                  onRemove={() => removePendingFile(index)}
                />
              ))}
            </div>
          )}

          <ChatInput
            value={input}
            onChange={setInput}
            activeCommand={activeCommand}
            onActiveCommandChange={setActiveCommand}
            promptMode={promptMode}
            onPromptModeChange={setPromptMode}
            onClearConversation={startNewChat}
            onSubmit={() => void submitMessage()}
            onPaste={handlePaste}
            onAttachClick={() => fileInputRef.current?.click()}
            fileInputRef={fileInputRef}
            accept={ACCEPTED_FILE_TYPES}
            onFileChange={handleFileSelection}
            disabled={isStreaming || isUploading}
            isBusy={isStreaming || isUploading}
            canSubmit={Boolean(input.trim() || pendingFiles.length > 0)}
            placeholder={t.inputPlaceholder}
            attachLabel={t.attach}
            sendLabel={t.send}
            hint={`${t.inputHint} · @ commands`}
            language={language}
          />
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
              <p className="kennek-label mb-3">{t.confirmDeleteTitle}</p>
              <h2
                id="delete-session-title"
                className="text-lg font-semibold text-kennek-ink"
              >
                {t.deleteSessionTitle}
              </h2>
              <p className="mt-2 text-sm leading-6 text-kennek-mist">
                {t.deleteSessionBodyPrefix}{" "}
                <span className="font-medium text-kennek-orange">
                  “{sessionToDelete.title}”
                </span>{" "}
                {t.deleteSessionBodySuffix}
              </p>

              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isDeletingSession}
                  onClick={() => setSessionToDelete(null)}
                  className="kennek-frame"
                >
                  <span className="kennek-frame-inner px-4 py-2.5 text-sm text-kennek-mist transition hover:text-kennek-ink">
                    {t.cancel}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={isDeletingSession}
                  onClick={() => void deleteSession(sessionToDelete.id)}
                  className="kennek-frame"
                >
                  <span className="kennek-frame-inner flex items-center gap-2 bg-kennek-orange px-4 py-2.5 text-sm font-bold text-kennek-on-accent transition hover:brightness-110 disabled:opacity-60">
                    {isDeletingSession ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" strokeWidth={2.5} />
                    )}
                    {t.confirmDelete}
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
