"use client";

import { fetchEventSource } from "@microsoft/fetch-event-source";
import {
  Bot,
  LoaderCircle,
  MessageSquare,
  Plus,
  SendHorizontal,
  Sparkles,
  User,
} from "lucide-react";
import { useSession } from "next-auth/react";
import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API_BASE = "http://localhost:8000";
const CHAT_ENDPOINT = `${API_BASE}/api/chat/stream`;

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

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
            className="text-cyan-300 underline decoration-cyan-400/40 underline-offset-4 hover:text-cyan-200"
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
                  ? `${className} block min-w-full font-mono text-sm leading-6 text-slate-200`
                  : "rounded bg-slate-950/80 px-1.5 py-0.5 font-mono text-[0.9em] text-cyan-200"
              }
            >
              {children}
            </code>
          );
        },
        h1: ({ children }) => (
          <h1 className="mb-3 mt-5 text-2xl font-semibold text-white">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-3 mt-5 text-xl font-semibold text-white">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-2 mt-4 text-lg font-semibold text-white">
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
  const { data: session } = useSession();
  const userEmail = session?.user?.email ?? null;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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

  const fetchHistory = useCallback(async (externalUserId: string) => {
    setIsLoadingHistory(true);
    try {
      const response = await fetch(
        `${API_BASE}/api/chat/history/${encodeURIComponent(externalUserId)}`,
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
            (message): message is { id: string; role: ChatRole; content: string } =>
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

  const submitMessage = async (event?: FormEvent) => {
    event?.preventDefault();

    const query = input.trim();
    if (!query || isStreaming) {
      return;
    }

    const previousMessages = messages;
    const userMessage = createMessage("user", query);
    const assistantMessage = createMessage("assistant", "");
    const controller = new AbortController();
    let assistantContent = "";

    abortControllerRef.current = controller;
    setInput("");
    setStatus(null);
    setIsStreaming(true);
    setMessages([...previousMessages, userMessage, assistantMessage]);

    try {
      await fetchEventSource(CHAT_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: query,
          history: previousMessages.map(({ role, content }) => ({
            role,
            content,
          })),
        }),
        signal: controller.signal,
        openWhenHidden: true,
        async onopen(response) {
          if (!response.ok) {
            throw new Error(`Chat request failed with status ${response.status}`);
          }
        },
        onmessage(eventMessage) {
          if (!eventMessage.data) {
            return;
          }

          const streamEvent = JSON.parse(eventMessage.data) as ServerEvent;

          if (streamEvent.type === "status") {
            setStatus("Searching web via Tavily...");
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
        await persistTurn(userMessage, assistantContent);
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
    setStatus(null);
    setIsStreaming(false);
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-slate-900 text-slate-100">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-white/10 bg-slate-950/80 md:flex">
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-indigo-500">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-semibold text-white">Kennek AI</p>
            <p className="text-xs text-slate-500">Research assistant</p>
          </div>
        </div>

        <div className="p-3">
          <button
            type="button"
            onClick={startNewChat}
            className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/10"
          >
            <Plus className="h-4 w-4" />
            Cuộc trò chuyện mới
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wider text-slate-500">
            Lịch sử chat
          </p>

          {!userEmail ? (
            <p className="px-3 py-4 text-sm text-slate-600">
              Đăng nhập để lưu và xem lịch sử hội thoại.
            </p>
          ) : isLoadingHistory ? (
            <div className="flex items-center gap-2 px-3 py-4 text-sm text-slate-500">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Đang tải...
            </div>
          ) : sessions.length > 0 ? (
            <div className="space-y-1">
              {sessions.map((chatSession) => (
                <button
                  key={chatSession.id}
                  type="button"
                  onClick={() => void loadSession(chatSession.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${
                    activeSessionId === chatSession.id
                      ? "bg-white/10 text-slate-100"
                      : "text-slate-300 hover:bg-white/5"
                  }`}
                >
                  <MessageSquare className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="truncate">{chatSession.title}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="px-3 py-4 text-sm text-slate-600">
              Chưa có cuộc trò chuyện
            </p>
          )}
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col bg-slate-900">
        <header className="flex h-16 shrink-0 items-center border-b border-white/10 bg-slate-900/80 px-5 backdrop-blur">
          <div className="flex items-center gap-3">
            <Bot className="h-5 w-5 text-cyan-400" />
            <div>
              <h1 className="text-sm font-semibold text-white">
                Kennek AI Assistant
              </h1>
              <p className="text-xs text-emerald-400">Online</p>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-40 pt-6 sm:px-6">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
            {messages.length === 0 ? (
              <div className="flex min-h-[55vh] flex-col items-center justify-center text-center">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10">
                  <Sparkles className="h-8 w-8 text-cyan-300" />
                </div>
                <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  Tôi có thể giúp gì cho bạn?
                </h2>
                <p className="mt-3 max-w-lg text-sm leading-6 text-slate-400">
                  Hỏi đáp, nghiên cứu thông tin trực tuyến hoặc truy vấn tài liệu
                  trong kho tri thức của bạn.
                </p>
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
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-700">
                      <Bot className="h-4 w-4 text-cyan-300" />
                    </div>
                  )}

                  {message.content && (
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm sm:max-w-[75%] ${
                        message.role === "user"
                          ? "rounded-tr-sm bg-blue-600 text-white"
                          : "rounded-tl-sm border border-white/10 bg-slate-800 text-slate-200"
                      }`}
                    >
                      {message.role === "assistant" ? (
                        <MarkdownMessage content={message.content} />
                      ) : (
                        <p className="whitespace-pre-wrap leading-6">
                          {message.content}
                        </p>
                      )}
                    </div>
                  )}

                  {message.role === "user" && (
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500">
                      <User className="h-4 w-4 text-white" />
                    </div>
                  )}
                </div>
              ))
            )}

            {status && (
              <div className="flex items-center gap-3 pl-11 text-sm text-cyan-300">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                <span>{status}</span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900 via-slate-900 to-transparent px-4 pb-5 pt-10 sm:px-6">
          <form
            onSubmit={submitMessage}
            className="mx-auto flex max-w-4xl items-end gap-3 rounded-2xl border border-white/10 bg-slate-800 p-2 shadow-2xl shadow-black/30 focus-within:border-cyan-400/40"
          >
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Nhập tin nhắn..."
              disabled={isStreaming}
              className="max-h-36 min-h-11 flex-1 resize-none bg-transparent px-3 py-3 text-sm leading-5 text-white outline-none placeholder:text-slate-500 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              aria-label="Gửi tin nhắn"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-500 text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
            >
              {isStreaming ? (
                <LoaderCircle className="h-5 w-5 animate-spin" />
              ) : (
                <SendHorizontal className="h-5 w-5" />
              )}
            </button>
          </form>
          <p className="mx-auto mt-2 max-w-4xl text-center text-[11px] text-slate-600">
            Enter để gửi · Shift + Enter để xuống dòng
          </p>
        </div>
      </main>
    </div>
  );
}
