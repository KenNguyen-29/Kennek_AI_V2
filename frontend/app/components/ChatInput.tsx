"use client";

import {
  ChevronDown,
  LoaderCircle,
  Paperclip,
  SendHorizontal,
  X,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import {
  filterChatCommands,
  getCommandById,
  isActiveChatCommand,
  type ActiveChatCommand,
  type ChatCommandDef,
} from "../lib/chat-commands";
import {
  getPromptMode,
  PROMPT_MODES,
  type PromptMode,
} from "../lib/prompt-modes";
import type { AppLanguage } from "../lib/settings-storage";

type ChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  activeCommand: ActiveChatCommand | null;
  onActiveCommandChange: (command: ActiveChatCommand | null) => void;
  promptMode: PromptMode;
  onPromptModeChange: (mode: PromptMode) => void;
  onClearConversation: () => void;
  onSubmit: (event?: FormEvent) => void;
  onPaste?: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onAttachClick: () => void;
  fileInputRef: RefObject<HTMLInputElement>;
  accept: string;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  isBusy?: boolean;
  canSubmit: boolean;
  placeholder: string;
  attachLabel: string;
  sendLabel: string;
  hint: string;
  language: AppLanguage;
};

function commandTitle(command: ChatCommandDef, language: AppLanguage): string {
  return language === "vi" ? command.titleVi : command.titleEn;
}

function commandDescription(
  command: ChatCommandDef,
  language: AppLanguage,
): string {
  return language === "vi" ? command.descriptionVi : command.descriptionEn;
}

/** Match `@query` immediately before the caret. */
function getAtToken(
  value: string,
  caret: number,
): { start: number; query: string } | null {
  const before = value.slice(0, caret);
  const match = before.match(/(^|[\s\n])@([\w-]*)$/u);
  if (!match) {
    return null;
  }
  const query = match[2] ?? "";
  const start = before.length - query.length - 1;
  return { start, query };
}

export function ChatInput({
  value,
  onChange,
  activeCommand,
  onActiveCommandChange,
  promptMode,
  onPromptModeChange,
  onClearConversation,
  onSubmit,
  onPaste,
  onAttachClick,
  fileInputRef,
  accept,
  onFileChange,
  disabled = false,
  isBusy = false,
  canSubmit,
  placeholder,
  attachLabel,
  sendLabel,
  hint,
  language,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const modeButtonRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [atToken, setAtToken] = useState<{ start: number; query: string } | null>(
    null,
  );
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [menuBox, setMenuBox] = useState<{
    left: number;
    bottom: number;
    width: number;
  } | null>(null);
  const [modeMenuBox, setModeMenuBox] = useState<{
    left: number;
    bottom: number;
    width: number;
  } | null>(null);
  const [mounted, setMounted] = useState(false);

  const filtered = useMemo(
    () => (menuOpen && atToken ? filterChatCommands(atToken.query) : []),
    [atToken, menuOpen],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setHighlightIndex(0);
  }, [atToken?.query, menuOpen]);

  const updateMenuPosition = () => {
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }
    const rect = anchor.getBoundingClientRect();
    setMenuBox({
      left: rect.left,
      bottom: window.innerHeight - rect.top + 8,
      width: rect.width,
    });
  };

  useLayoutEffect(() => {
    if (!menuOpen) {
      return;
    }
    updateMenuPosition();
    const onReposition = () => updateMenuPosition();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [menuOpen, value, activeCommand]);

  useLayoutEffect(() => {
    if (!modeMenuOpen) {
      return;
    }
    const button = modeButtonRef.current;
    if (!button) {
      return;
    }
    const place = () => {
      const rect = button.getBoundingClientRect();
      setModeMenuBox({
        left: rect.left,
        bottom: window.innerHeight - rect.top + 8,
        width: Math.max(rect.width, 220),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [modeMenuOpen]);

  useEffect(() => {
    if (!modeMenuOpen) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        modeButtonRef.current?.contains(target) ||
        (target instanceof Element &&
          target.closest("[data-kennek-mode-menu]"))
      ) {
        return;
      }
      setModeMenuOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [modeMenuOpen]);

  const syncAtToken = (nextValue: string, caret: number) => {
    const token = getAtToken(nextValue, caret);
    setAtToken(token);
    setMenuOpen(Boolean(token));
    if (token) {
      requestAnimationFrame(() => updateMenuPosition());
    }
  };

  const applyCommand = (command: ChatCommandDef) => {
    if (!atToken) {
      if (command.isAction) {
        onClearConversation();
        onActiveCommandChange(null);
        return;
      }
      if (isActiveChatCommand(command.id)) {
        onActiveCommandChange(command.id);
        if (command.id === "reasoning" || command.id === "code") {
          onPromptModeChange(command.id);
        }
      }
      return;
    }

    const before = value.slice(0, atToken.start);
    const after = value.slice(atToken.start + 1 + atToken.query.length);
    const nextValue = `${before}${after}`.replace(/\s{2,}/g, " ");
    onChange(nextValue.trimStart());
    setMenuOpen(false);
    setAtToken(null);

    if (command.isAction) {
      onClearConversation();
      onActiveCommandChange(null);
      return;
    }

    if (isActiveChatCommand(command.id)) {
      onActiveCommandChange(command.id);
      if (command.id === "reasoning" || command.id === "code") {
        onPromptModeChange(command.id);
      }
    }

    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value;
    onChange(next);
    syncAtToken(next, event.target.selectionStart ?? next.length);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Open menu immediately when typing @ (before React re-render).
    if (event.key === "@") {
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) {
          return;
        }
        syncAtToken(el.value, el.selectionStart ?? el.value.length);
      });
    }

    if (menuOpen && filtered.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightIndex((current) => (current + 1) % filtered.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightIndex(
          (current) => (current - 1 + filtered.length) % filtered.length,
        );
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        applyCommand(filtered[highlightIndex] ?? filtered[0]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        setAtToken(null);
        return;
      }
    }

    if (event.key === "Backspace" && activeCommand && !value) {
      event.preventDefault();
      onActiveCommandChange(null);
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!menuOpen) {
        onSubmit();
      }
    }
  };

  const activeDef = activeCommand ? getCommandById(activeCommand) : null;
  const ActiveIcon = activeDef?.icon;
  const selectedMode = getPromptMode(promptMode);
  const ModeIcon = selectedMode.icon;
  const modeLabel =
    language === "vi" ? selectedMode.labelVi : selectedMode.labelEn;

  const modeMenu =
    mounted && modeMenuOpen && modeMenuBox
      ? createPortal(
          <div
            data-kennek-mode-menu
            className="fixed z-[80] overflow-hidden clip-chamfer border border-[#FF5500] bg-kennek-panel text-kennek-ink shadow-[0_12px_40px_rgba(0,0,0,0.18)]"
            style={{
              left: modeMenuBox.left,
              bottom: modeMenuBox.bottom,
              width: modeMenuBox.width,
            }}
            role="listbox"
            aria-label="Prompt mode"
          >
            <div className="py-1">
              {PROMPT_MODES.map((mode) => {
                const Icon = mode.icon;
                const active = mode.id === promptMode;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onPromptModeChange(mode.id);
                      setModeMenuOpen(false);
                    }}
                    className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition ${
                      active
                        ? "bg-[#FF5500]/15 text-kennek-ink"
                        : "text-kennek-mist hover:bg-kennek-steel/35 hover:text-kennek-ink"
                    }`}
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center clip-chamfer-sm bg-kennek-black ring-1 ring-[#FF5500]/40">
                      <Icon
                        className="h-4 w-4 text-[#FF5500]"
                        strokeWidth={2.4}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-kennek-ink">
                        {language === "vi" ? mode.labelVi : mode.labelEn}
                      </span>
                      <span className="mt-0.5 block text-xs text-kennek-ash">
                        {language === "vi"
                          ? mode.descriptionVi
                          : mode.descriptionEn}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )
      : null;

  const menu =
    mounted && menuOpen && filtered.length > 0 && menuBox
      ? createPortal(
          <div
            className="fixed z-[80] overflow-hidden clip-chamfer border border-[#FF5500] bg-kennek-panel text-kennek-ink shadow-[0_12px_40px_rgba(0,0,0,0.18)] [.dark_&]:shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
            style={{
              left: menuBox.left,
              bottom: menuBox.bottom,
              width: menuBox.width,
            }}
            role="listbox"
            aria-label="Command suggestions"
          >
            <div className="max-h-64 overflow-y-auto py-1">
              {filtered.map((command, index) => {
                const Icon = command.icon;
                const active = index === highlightIndex;
                return (
                  <button
                    key={command.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onMouseDown={(event) => {
                      // Prevent textarea blur before click applies.
                      event.preventDefault();
                    }}
                    onMouseEnter={() => setHighlightIndex(index)}
                    onClick={() => applyCommand(command)}
                    className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition ${
                      active
                        ? "bg-[#FF5500]/15 text-kennek-ink"
                        : "text-kennek-mist hover:bg-kennek-steel/35 hover:text-kennek-ink"
                    }`}
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center clip-chamfer-sm bg-kennek-black ring-1 ring-[#FF5500]/40">
                      <Icon
                        className="h-4 w-4 text-[#FF5500]"
                        strokeWidth={2.4}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-[#FF5500]">
                          {command.trigger}
                        </span>
                        <span className="truncate text-sm font-medium text-kennek-ink">
                          {commandTitle(command, language)}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-kennek-ash">
                        {commandDescription(command, language)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div ref={anchorRef} className="relative">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!menuOpen) {
              onSubmit(event);
            }
          }}
          className="kennek-frame kennek-frame-active focus-within:brightness-110"
        >
          <div className="kennek-frame-inner bg-kennek-panel p-2">
            {activeDef && ActiveIcon ? (
              <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
                <span className="inline-flex items-center gap-1.5 clip-chamfer-sm bg-[#FF5500] px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wide text-kennek-black">
                  <ActiveIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
                  @{activeDef.id}
                  <button
                    type="button"
                    onClick={() => onActiveCommandChange(null)}
                    aria-label={`Remove @${activeDef.id}`}
                    className="ml-0.5 p-0.5 transition hover:opacity-70"
                  >
                    <X className="h-3 w-3" strokeWidth={2.8} />
                  </button>
                </span>
              </div>
            ) : null}

            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={accept}
                className="hidden"
                onChange={onFileChange}
              />
              <button
                type="button"
                onClick={onAttachClick}
                disabled={disabled}
                aria-label={attachLabel}
                className="clip-chamfer-sm flex h-11 w-11 shrink-0 items-center justify-center bg-kennek-black text-kennek-mist ring-1 ring-kennek-steel transition hover:text-kennek-orange hover:ring-kennek-orange/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Paperclip className="h-5 w-5" strokeWidth={2.4} />
              </button>
              <textarea
                ref={textareaRef}
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onPaste={onPaste}
                onClick={(event) => {
                  const target = event.currentTarget;
                  syncAtToken(target.value, target.selectionStart ?? 0);
                }}
                onSelect={(event) => {
                  const target = event.currentTarget;
                  syncAtToken(target.value, target.selectionStart ?? 0);
                }}
                rows={1}
                placeholder={placeholder}
                disabled={disabled}
                className="max-h-36 min-h-11 flex-1 resize-none bg-transparent px-3 py-3 text-sm leading-5 text-kennek-ink outline-none placeholder:text-kennek-ash disabled:cursor-not-allowed"
              />
              <button
                type="submit"
                disabled={!canSubmit || disabled}
                aria-label={sendLabel}
                className="clip-chamfer-sm flex h-11 w-11 shrink-0 items-center justify-center bg-kennek-orange text-kennek-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-kennek-steel disabled:text-kennek-ash"
              >
                {isBusy ? (
                  <LoaderCircle
                    className="h-5 w-5 animate-spin"
                    strokeWidth={2.5}
                  />
                ) : (
                  <SendHorizontal className="h-5 w-5" strokeWidth={2.5} />
                )}
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2 px-1">
              <button
                ref={modeButtonRef}
                type="button"
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={modeMenuOpen}
                onClick={() => setModeMenuOpen((open) => !open)}
                className="clip-chamfer-sm inline-flex items-center gap-1.5 bg-kennek-black px-2.5 py-1.5 text-xs font-medium text-kennek-mist ring-1 ring-kennek-steel transition hover:text-kennek-orange hover:ring-[#FF5500]/50 disabled:opacity-50"
              >
                <ModeIcon className="h-3.5 w-3.5 text-[#FF5500]" strokeWidth={2.5} />
                <span>{modeLabel}</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 transition ${modeMenuOpen ? "rotate-180" : ""}`}
                  strokeWidth={2.5}
                />
              </button>
            </div>
          </div>
        </form>
      </div>
      {menu}
      {modeMenu}
      <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-kennek-ash">
        {hint}
      </p>
    </div>
  );
}
