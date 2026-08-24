"use client";

import { useEffect, useRef, useState } from "react";

function readGameStateKey() {
  const grid = document.querySelector<HTMLElement>(".game-grid");
  if (!grid) return null;
  const phaseClass = Array.from(grid.classList).find((value) => value.startsWith("phase-"));
  if (!phaseClass) return null;
  const phase = phaseClass.slice("phase-".length);
  const roundLabel = document.querySelector<HTMLElement>(".room-header h2")?.textContent?.trim() ?? "";
  return { key: `${phase}:${roundLabel}`, phase };
}

function actionName(button: HTMLButtonElement) {
  const aria = button.getAttribute("aria-label")?.trim();
  return aria || button.textContent?.replace(/\s+/g, " ").trim() || "action";
}

export default function GamePhaseGuard() {
  const [transitionMessage, setTransitionMessage] = useState("");
  const lastGameState = useRef<{ key: string; phase: string } | null>(null);
  const actionLocks = useRef(new Set<string>());
  const transitionTimer = useRef<number | null>(null);

  useEffect(() => {
    const guardedSelectors = [
      ".phase-action",
      ".discussion-decision-trigger",
      ".decision-options button",
      ".vote-actions button",
      ".lobby-actions button",
      ".role-card",
    ].join(",");

    const handleClickCapture = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>("button");
      if (!button || !button.closest(".game-wrap") || !button.matches(guardedSelectors)) return;

      const gameState = readGameStateKey();
      const key = `${gameState?.key ?? "game"}:${actionName(button)}`;
      if (actionLocks.current.has(key)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      actionLocks.current.add(key);
      window.setTimeout(() => actionLocks.current.delete(key), 1800);
    };

    document.addEventListener("click", handleClickCapture, true);
    return () => document.removeEventListener("click", handleClickCapture, true);
  }, []);

  useEffect(() => {
    const inspect = () => {
      const current = readGameStateKey();
      if (!current) {
        lastGameState.current = null;
        actionLocks.current.clear();
        return;
      }

      const previous = lastGameState.current;
      if (previous && previous.key !== current.key) {
        actionLocks.current.clear();

        const staleNoticeClose = document.querySelector<HTMLButtonElement>(".toast button[aria-label='Fechar aviso']");
        staleNoticeClose?.click();

        if (previous.phase === "discussion" && current.phase === "voting") {
          setTransitionMessage("Tempo encerrado — abrindo a votação…");
          if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
          transitionTimer.current = window.setTimeout(() => setTransitionMessage(""), 3200);
        } else {
          setTransitionMessage("");
        }
      }

      lastGameState.current = current;
    };

    inspect();
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      observer.disconnect();
      if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
    };
  }, []);

  if (!transitionMessage) return null;
  return (
    <div className="phase-transition-toast" role="status" aria-live="assertive">
      <span aria-hidden="true">⏱</span>
      <strong>{transitionMessage}</strong>
    </div>
  );
}
