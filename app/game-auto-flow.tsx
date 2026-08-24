"use client";

import { useEffect, useRef } from "react";

function readRoundKey() {
  const phase = document.querySelector<HTMLElement>(".game-grid.phase-reveal");
  if (!phase) return null;
  const round = document.querySelector<HTMLElement>(".room-header h2")?.textContent?.trim() ?? "rodada";
  return `reveal:${round}`;
}

function readSeenProgress() {
  const text = document.querySelector<HTMLElement>(".game-grid.phase-reveal .seen-progress")?.textContent ?? "";
  const match = text.match(/(\d+)\s*\/\s*(\d+)\s+viram o papel/i);
  if (!match) return { seen: 0, total: 0, complete: false };
  const seen = Number(match[1]);
  const total = Number(match[2]);
  return { seen, total, complete: total > 0 && seen >= total };
}

function findRevealAdvanceButton() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>(".game-grid.phase-reveal .phase-action"))
    .find((button) => /começar pistas/i.test(button.textContent ?? "")) ?? null;
}

function revealHostCardIfNeeded() {
  const card = document.querySelector<HTMLButtonElement>(".game-grid.phase-reveal .role-card");
  if (!card || card.disabled || card.classList.contains("revealed")) return false;
  card.click();
  return true;
}

export default function GameAutoFlow() {
  const locks = useRef(new Set<string>());
  const revealLocks = useRef(new Set<string>());

  useEffect(() => {
    const inspect = () => {
      const key = readRoundKey();
      if (!key) {
        locks.current.clear();
        revealLocks.current.clear();
        return;
      }

      const progress = readSeenProgress();
      const button = findRevealAdvanceButton();
      if (!progress.complete || !button || locks.current.has(key)) return;

      if (button.disabled) {
        if (!revealLocks.current.has(key) && revealHostCardIfNeeded()) {
          revealLocks.current.add(key);
          window.setTimeout(() => revealLocks.current.delete(key), 900);
        }
        return;
      }

      locks.current.add(key);
      window.setTimeout(() => {
        if (!button.isConnected || button.disabled) {
          locks.current.delete(key);
          return;
        }
        button.click();
      }, 420);
    };

    inspect();
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "disabled"],
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
