"use client";

import { useEffect, useRef, useState } from "react";

function focusableWithin(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(
    'button:not([disabled]):not([hidden]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hasAttribute("aria-hidden"));
}

export default function InteractionSafety() {
  const [leaveButton, setLeaveButton] = useState<HTMLButtonElement | null>(null);
  const bypassLeave = useRef(false);
  const leaveDialog = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onClickCapture = (event: MouseEvent) => {
      if (!document.querySelector(".game-wrap")) return;
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest<HTMLButtonElement>("button");
      if (!button) return;
      const isBrand = button.matches(".topbar .brand");
      const isExit = button.matches(".topbar .ghost-button.compact") && /sair/i.test(button.textContent ?? "");
      if (!isBrand && !isExit) return;

      if (bypassLeave.current) {
        bypassLeave.current = false;
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      previousFocus.current = button;
      setLeaveButton(button);
    };

    document.addEventListener("click", onClickCapture, true);
    return () => document.removeEventListener("click", onClickCapture, true);
  }, []);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!document.querySelector(".game-wrap")) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    if (!leaveButton) return;
    const dialog = leaveDialog.current;
    if (!dialog) return;
    const controls = focusableWithin(dialog);
    controls[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setLeaveButton(null);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusableWithin(dialog);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previousFocus.current?.focus({ preventScroll: true });
    };
  }, [leaveButton]);

  useEffect(() => {
    let previousRulesModal: HTMLElement | null = null;
    let frame: number | null = null;

    const inspect = () => {
      const modal = document.querySelector<HTMLElement>(".rules-modal");
      if (previousRulesModal && !modal) {
        document.querySelector<HTMLButtonElement>(".rules-button")?.focus({ preventScroll: true });
      }
      previousRulesModal = modal;
    };
    const schedule = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        inspect();
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const modal = document.querySelector<HTMLElement>(".rules-modal");
      if (modal && event.key === "Tab") {
        const items = focusableWithin(modal);
        if (items.length) {
          const first = items[0];
          const last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
        return;
      }

      const menu = document.querySelector<HTMLElement>(".theme-menu");
      if (!menu) return;
      const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('button[role="menuitemradio"]'));
      if (!items.length) return;
      const current = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
      let next = current;
      if (event.key === "ArrowDown") next = (current + 1) % items.length;
      else if (event.key === "ArrowUp") next = (current - 1 + items.length) % items.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = items.length - 1;
      else if (event.key === "Escape") {
        window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".theme-trigger")?.focus());
        return;
      } else return;
      event.preventDefault();
      items[next]?.focus();
    };

    document.addEventListener("keydown", onKeyDown, true);
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    let resetTimer: number | null = null;
    let handledToast: HTMLElement | null = null;
    const observer = new MutationObserver(() => {
      const toast = document.querySelector<HTMLElement>(".toast.success");
      if (!toast || toast === handledToast || !/link da sala copiado/i.test(toast.textContent ?? "")) return;
      const button = document.querySelector<HTMLButtonElement>(".room-code-block button");
      if (!button || button.dataset.copyFeedback === "true") return;
      handledToast = toast;
      const original = button.textContent ?? "Copiar";
      button.dataset.copyFeedback = "true";
      button.textContent = "Copiado ✓";
      if (resetTimer !== null) window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        if (button.isConnected) {
          button.textContent = original;
          delete button.dataset.copyFeedback;
        }
      }, 1800);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (resetTimer !== null) window.clearTimeout(resetTimer);
    };
  }, []);

  const cancelLeave = () => setLeaveButton(null);
  const confirmLeave = () => {
    const target = leaveButton;
    setLeaveButton(null);
    if (!target) return;
    window.requestAnimationFrame(() => {
      if (!target.isConnected) return;
      bypassLeave.current = true;
      target.click();
    });
  };

  if (!leaveButton) return null;

  return (
    <div className="leave-confirm-backdrop" role="presentation" onPointerDown={cancelLeave}>
      <div
        ref={leaveDialog}
        className="leave-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="leave-confirm-title"
        aria-describedby="leave-confirm-description"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <span className="leave-confirm-icon" aria-hidden="true">↗</span>
        <small>Antes de sair</small>
        <h2 id="leave-confirm-title">Sair desta sala?</h2>
        <p id="leave-confirm-description">Você será removido da partida atual e precisará entrar novamente com o código da sala.</p>
        <div>
          <button type="button" className="ghost-button" onClick={cancelLeave}>Continuar jogando</button>
          <button type="button" className="primary-button" onClick={confirmLeave}>Sair da sala</button>
        </div>
      </div>
    </div>
  );
}
