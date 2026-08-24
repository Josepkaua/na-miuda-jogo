"use client";

import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const CHAT_EMOJIS = [
  "😂", "🤣", "😭", "😅", "😎", "🤨",
  "👀", "🤔", "😳", "😱", "🙄", "😈",
  "🤡", "🕵️", "🎭", "🔎", "👌", "👍",
  "👎", "🔥", "💀", "✅", "❌", "❤️",
];

function getComposer() {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLFormElement>(".chat-composer");
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

function insertEmoji(composer: HTMLFormElement, emoji: string) {
  const input = composer.querySelector<HTMLInputElement>('input[aria-label="Mensagem para o chat da sala"]')
    ?? composer.querySelector<HTMLInputElement>("input");
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
    input.focus();
    input.setSelectionRange(cursor, cursor);
  });
  return true;
}

export default function ChatEmojiPicker() {
  const composer = useSyncExternalStore(subscribeComposer, getComposer, () => null);
  const [open, setOpen] = useState(false);

  if (!composer) return null;

  return createPortal(
    <div className="chat-emoji-tools">
      <button
        className="emoji-trigger"
        type="button"
        aria-label="Abrir emojis"
        aria-expanded={open}
        aria-controls="chat-emoji-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">☺</span>
      </button>
      {open && (
        <div id="chat-emoji-menu" className="emoji-menu" role="menu" aria-label="Emojis rápidos">
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
