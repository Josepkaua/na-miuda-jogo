"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const CHAT_EMOJIS = [
  "😂", "🤣", "😭", "😅", "😎", "🤨",
  "👀", "🤔", "😳", "😱", "🙄", "😈",
  "🤡", "🕵️", "🎭", "🔎", "👌", "👍",
  "👎", "🔥", "💀", "✅", "❌", "❤️",
];
const EMOJI_COLUMNS = 6;

function getComposer() {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLFormElement>(".chat-composer");
}

function getChatInput(composer: HTMLFormElement) {
  return composer.querySelector<HTMLInputElement>('input[aria-label="Mensagem para o chat da sala"]')
    ?? composer.querySelector<HTMLInputElement>("input");
}

function subscribeComposer(onStoreChange: () => void) {
  if (typeof document === "undefined") return () => {};

  let previous = getComposer();
  const observer = new MutationObserver(() => {
    const next = getComposer();
    if (next === previous) return;
    previous = next;
    onStoreChange();
  });

  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}

function returnFocusToChat(composer: HTMLFormElement) {
  const input = getChatInput(composer);
  if (!input || input.disabled) return;
  window.requestAnimationFrame(() => input.focus({ preventScroll: true }));
}

function insertEmoji(composer: HTMLFormElement, emoji: string) {
  const input = getChatInput(composer);
  if (!input || input.disabled) return false;

  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  const nextValue = `${input.value.slice(0, start)}${emoji}${input.value.slice(end)}`;
  const limit = input.maxLength > 0 ? input.maxLength : 280;
  if (nextValue.length > limit) return false;

  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  valueSetter?.call(input, nextValue);
  input.dispatchEvent(new Event("input", { bubbles: true }));

  const cursor = start + emoji.length;
  window.requestAnimationFrame(() => {
    input.focus({ preventScroll: true });
    input.setSelectionRange(cursor, cursor);
  });
  return true;
}

export default function ChatEmojiPicker() {
  const composer = useSyncExternalStore(subscribeComposer, getComposer, () => null);
  const [open, setOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !composer) return;

    const close = () => {
      setOpen(false);
      returnFocusToChat(composer);
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && toolsRef.current?.contains(target)) return;
      close();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [composer, open]);

  if (!composer) return null;

  const moveMenuFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>(".emoji-grid button") ?? []);
    if (!buttons.length) return;
    const activeIndex = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
    let nextIndex = activeIndex;

    if (event.key === "ArrowRight") nextIndex = (activeIndex + 1) % buttons.length;
    else if (event.key === "ArrowLeft") nextIndex = (activeIndex - 1 + buttons.length) % buttons.length;
    else if (event.key === "ArrowDown") nextIndex = (activeIndex + EMOJI_COLUMNS) % buttons.length;
    else if (event.key === "ArrowUp") nextIndex = (activeIndex - EMOJI_COLUMNS + buttons.length) % buttons.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = buttons.length - 1;
    else return;

    event.preventDefault();
    buttons[nextIndex]?.focus();
  };

  const openFromKeyboard = () => {
    setOpen(true);
    window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>(".emoji-grid button")?.focus();
    });
  };

  return createPortal(
    <div className="chat-emoji-tools" ref={toolsRef}>
      <button
        className="emoji-trigger"
        type="button"
        aria-label="Abrir emojis"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="chat-emoji-menu"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          openFromKeyboard();
        }}
      >
        <span aria-hidden="true">☺</span>
      </button>
      {open && (
        <div
          id="chat-emoji-menu"
          ref={menuRef}
          className="emoji-menu"
          role="menu"
          aria-label="Emojis rápidos"
          onKeyDown={moveMenuFocus}
        >
          <div className="emoji-menu-heading">
            <strong>Emojis rápidos</strong>
            <small>Toque para inserir</small>
          </div>
          <div className="emoji-grid">
            {CHAT_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                role="menuitem"
                aria-label={`Inserir ${emoji}`}
                onClick={() => {
                  if (insertEmoji(composer, emoji)) setOpen(false);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>,
    composer,
  );
}
