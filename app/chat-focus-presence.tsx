"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient, hasRemoteBackend } from "../lib/supabase";

type TypingEntry = {
  nickname: string;
  timer: ReturnType<typeof setTimeout>;
};

type TypingState = {
  roomCode: string;
  names: string[];
};

let domVersion = 0;
let sharedDomObserver: MutationObserver | null = null;
const domSubscribers = new Set<() => void>();

function getComposer() {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLFormElement>(".chat-composer");
}

function getChatPanel() {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(".chat-panel");
}

function getRoomCode() {
  if (typeof document === "undefined") return "";
  return document.querySelector<HTMLElement>(".room-code-block strong")?.textContent?.trim() ?? "";
}

function emitDomChange() {
  domVersion += 1;
  domSubscribers.forEach((subscriber) => subscriber());
}

function subscribeDom(onStoreChange: () => void) {
  if (typeof document === "undefined") return () => {};
  domSubscribers.add(onStoreChange);

  if (!sharedDomObserver) {
    sharedDomObserver = new MutationObserver(emitDomChange);
    sharedDomObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  return () => {
    domSubscribers.delete(onStoreChange);
    if (domSubscribers.size > 0) return;
    sharedDomObserver?.disconnect();
    sharedDomObserver = null;
  };
}

function getDomVersion() {
  return domVersion;
}

function getChatInput(composer: HTMLFormElement | null) {
  if (!composer) return null;
  return composer.querySelector<HTMLInputElement>('input[aria-label="Mensagem para o chat da sala"]')
    ?? composer.querySelector<HTMLInputElement>("input");
}

function shouldAutoFocus(input: HTMLInputElement) {
  if (input.disabled) return false;
  if (!document.querySelector(".discussion-mode")) return false;
  return window.matchMedia("(pointer: fine)").matches;
}

function isEditable(element: Element | null) {
  return element instanceof HTMLInputElement
    || element instanceof HTMLTextAreaElement
    || element instanceof HTMLSelectElement
    || (element instanceof HTMLElement && element.isContentEditable);
}

function sameNames(a: string[], b: string[]) {
  return a.length === b.length && a.every((name, index) => name === b[index]);
}

export default function ChatFocusPresence() {
  useSyncExternalStore(subscribeDom, getDomVersion, () => 0);
  const composer = getComposer();
  const chatPanel = getChatPanel();
  const roomCode = getRoomCode();
  const [typingState, setTypingState] = useState<TypingState>({ roomCode: "", names: [] });
  const clientId = useRef<string | null>(null);

  useEffect(() => {
    const input = getChatInput(composer);
    if (!composer || !input) return;

    const focusInput = () => {
      if (!shouldAutoFocus(input)) return;
      window.requestAnimationFrame(() => {
        if (!shouldAutoFocus(input)) return;
        input.focus({ preventScroll: true });
        const cursor = input.value.length;
        input.setSelectionRange(cursor, cursor);
      });
    };

    const onSubmit = () => {
      window.setTimeout(focusInput, 40);
    };

    const onPanelPointerUp = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".emoji-trigger, .emoji-menu, button, a, input")) return;
      focusInput();
    };

    const onGlobalKeyDown = (event: KeyboardEvent) => {
      if (!shouldAutoFocus(input)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.length !== 1) return;
      if (isEditable(document.activeElement)) return;
      input.focus({ preventScroll: true });
    };

    const disabledObserver = new MutationObserver(() => {
      if (!input.disabled) focusInput();
    });
    disabledObserver.observe(input, { attributes: true, attributeFilter: ["disabled"] });

    composer.addEventListener("submit", onSubmit);
    chatPanel?.addEventListener("pointerup", onPanelPointerUp);
    document.addEventListener("keydown", onGlobalKeyDown, true);
    focusInput();

    return () => {
      disabledObserver.disconnect();
      composer.removeEventListener("submit", onSubmit);
      chatPanel?.removeEventListener("pointerup", onPanelPointerUp);
      document.removeEventListener("keydown", onGlobalKeyDown, true);
    };
  }, [chatPanel, composer]);

  useEffect(() => {
    if (!composer || !roomCode || !hasRemoteBackend()) return;
    const input = getChatInput(composer);
    const supabase = getSupabaseClient();
    if (!input || !supabase) return;

    if (!clientId.current) {
      clientId.current = typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    const myId = clientId.current;
    const typing = new Map<string, TypingEntry>();
    let channel: RealtimeChannel | null = null;
    let lastTypingSentAt = 0;
    let localTypingActive = false;
    let subscribed = false;

    const syncTypingNames = () => {
      const names = Array.from(typing.values(), (entry) => entry.nickname).slice(0, 3);
      setTypingState((current) => {
        if (current.roomCode === roomCode && sameNames(current.names, names)) return current;
        return { roomCode, names };
      });
    };

    const clearTypingUser = (id: string) => {
      const current = typing.get(id);
      if (!current) return;
      clearTimeout(current.timer);
      typing.delete(id);
      syncTypingNames();
    };

    const handleTypingPayload = (payload: unknown) => {
      if (!payload || typeof payload !== "object") return;
      const data = payload as Record<string, unknown>;
      const id = typeof data.id === "string" ? data.id : "";
      const nickname = typeof data.nickname === "string" && data.nickname.trim()
        ? data.nickname.trim().slice(0, 20)
        : "Alguém";
      const active = data.typing === true;
      if (!id || id === myId) return;

      if (!active) {
        clearTypingUser(id);
        return;
      }

      const previous = typing.get(id);
      if (previous) clearTimeout(previous.timer);
      const timer = setTimeout(() => clearTypingUser(id), 1900);
      typing.set(id, { nickname, timer });
      syncTypingNames();
    };

    const sendTyping = (active: boolean) => {
      if (!channel || !subscribed) return;
      const nickname = localStorage.getItem("na-miuda-nickname")?.trim() || "Alguém";
      void channel.send({
        type: "broadcast",
        event: "typing",
        payload: { id: myId, nickname: nickname.slice(0, 20), typing: active },
      });
    };

    const startTyping = () => {
      const now = Date.now();
      if (localTypingActive && now - lastTypingSentAt < 650) return;
      localTypingActive = true;
      lastTypingSentAt = now;
      sendTyping(true);
    };

    const stopTyping = () => {
      if (!localTypingActive) return;
      localTypingActive = false;
      sendTyping(false);
    };

    channel = supabase
      .channel(`na-miuda-typing-${roomCode}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, ({ payload }) => handleTypingPayload(payload));
    channel.subscribe((status) => {
      subscribed = status === "SUBSCRIBED";
      if (subscribed && input.value.trim()) startTyping();
    });

    const onInput = () => {
      if (!input.value.trim()) {
        stopTyping();
        return;
      }
      startTyping();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") stopTyping();
    };

    input.addEventListener("input", onInput);
    input.addEventListener("blur", stopTyping);
    composer.addEventListener("submit", stopTyping);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopTyping();
      input.removeEventListener("input", onInput);
      input.removeEventListener("blur", stopTyping);
      composer.removeEventListener("submit", stopTyping);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      for (const entry of typing.values()) clearTimeout(entry.timer);
      typing.clear();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [composer, roomCode]);

  const typingNames = typingState.roomCode === roomCode ? typingState.names : [];
  if (!chatPanel || typingNames.length === 0) return null;

  const label = typingNames.length === 1
    ? `${typingNames[0]} está digitando`
    : typingNames.length === 2
      ? `${typingNames[0]} e ${typingNames[1]} estão digitando`
      : "Várias pessoas estão digitando";

  return createPortal(
    <div className="chat-typing-indicator" role="status" aria-live="polite" aria-label={label}>
      <span>{label}</span>
      <i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" />
    </div>,
    chatPanel,
  );
}
