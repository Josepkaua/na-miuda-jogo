"use client";

import { useEffect, useRef } from "react";

type Phase = "lobby" | "reveal" | "discussion" | "voting" | "results";

const phaseTitles: Record<Phase, string> = {
  lobby: "Na Miúda! — Sala de espera",
  reveal: "🔐 Veja seu papel — Na Miúda!",
  discussion: "💬 Discussão aberta — Na Miúda!",
  voting: "🗳️ Vote agora — Na Miúda!",
  results: "✦ Resultado da rodada — Na Miúda!",
};

function readPhase(): Phase | null {
  const grid = document.querySelector<HTMLElement>(".game-grid");
  if (!grid) return null;
  if (grid.classList.contains("phase-lobby")) return "lobby";
  if (grid.classList.contains("phase-reveal")) return "reveal";
  if (grid.classList.contains("phase-discussion")) return "discussion";
  if (grid.classList.contains("phase-voting")) return "voting";
  if (grid.classList.contains("phase-results")) return "results";
  return null;
}

function parseClock(value: string) {
  const match = value.trim().match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function syncDiscussionUrgency() {
  const timer = document.querySelector<HTMLElement>(".game-grid.phase-discussion .timer-ring");
  if (!timer) return;
  const seconds = parseClock(timer.querySelector<HTMLElement>("strong")?.textContent ?? "");
  const warning = seconds !== null && seconds > 10 && seconds <= 30;
  const critical = seconds !== null && seconds > 0 && seconds <= 10;
  timer.classList.toggle("is-warning", warning);
  timer.classList.toggle("is-critical", critical);
}

function syncVotingUrgency() {
  const grid = document.querySelector<HTMLElement>(".game-grid.phase-voting");
  if (!grid) return;
  const progress = grid.querySelector<HTMLElement>(".vote-progress > span")?.textContent ?? "";
  const match = progress.match(/encerra em\s+(\d{1,2}:\d{2})/i);
  const seconds = match ? parseClock(match[1]) : null;
  grid.classList.toggle("is-time-warning", seconds !== null && seconds > 10 && seconds <= 30);
  grid.classList.toggle("is-time-critical", seconds !== null && seconds >= 0 && seconds <= 10);
}

function pulseDevice(phase: Phase) {
  if (!("vibrate" in navigator)) return;
  if (phase === "voting") navigator.vibrate(45);
  if (phase === "results") navigator.vibrate([35, 55, 35]);
}

export default function GameMotionController() {
  const lastPhase = useRef<Phase | null>(null);
  const originalTitle = useRef<string | null>(null);

  useEffect(() => {
    originalTitle.current = document.title;
    const scoreMemory = new WeakMap<HTMLElement, string>();
    const stateMemory = new WeakMap<HTMLElement, string>();
    const timers = new Set<number>();

    const animateOnce = (element: HTMLElement, className: string, duration = 560) => {
      element.classList.remove(className);
      void element.offsetWidth;
      element.classList.add(className);
      const timer = window.setTimeout(() => {
        element.classList.remove(className);
        timers.delete(timer);
      }, duration);
      timers.add(timer);
    };

    const syncScoreFeedback = () => {
      document.querySelectorAll<HTMLElement>(".player-score").forEach((score) => {
        const current = score.textContent?.replace(/\s+/g, " ").trim() ?? "";
        const previous = scoreMemory.get(score);
        if (previous !== undefined && previous !== current) animateOnce(score, "score-changed");
        scoreMemory.set(score, current);
      });
    };

    const syncPlayerStateFeedback = () => {
      document.querySelectorAll<HTMLElement>(".player-row").forEach((row) => {
        const state = row.querySelector<HTMLElement>(".player-name small")?.textContent?.trim() ?? "";
        const previous = stateMemory.get(row);
        if (previous !== undefined && previous !== state) animateOnce(row, "player-state-changed", 500);
        stateMemory.set(row, state);
      });
    };

    const syncPhaseDataset = (phase: Phase | null) => {
      if (phase) document.documentElement.dataset.gamePhase = phase;
      else delete document.documentElement.dataset.gamePhase;
    };

    const inspect = () => {
      const phase = readPhase();
      syncPhaseDataset(phase);
      syncDiscussionUrgency();
      syncVotingUrgency();
      syncScoreFeedback();
      syncPlayerStateFeedback();

      if (!phase) {
        lastPhase.current = null;
        if (originalTitle.current) document.title = originalTitle.current;
        return;
      }

      if (document.title !== phaseTitles[phase]) document.title = phaseTitles[phase];
      if (lastPhase.current && lastPhase.current !== phase) pulseDevice(phase);
      lastPhase.current = phase;
    };

    inspect();
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
      attributeFilter: ["class", "disabled", "style"],
    });

    return () => {
      observer.disconnect();
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
      delete document.documentElement.dataset.gamePhase;
      if (originalTitle.current) document.title = originalTitle.current;
    };
  }, []);

  return null;
}
