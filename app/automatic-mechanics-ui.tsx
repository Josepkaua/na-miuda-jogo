"use client";

import { useEffect } from "react";

function hideAutomationButton(button: HTMLButtonElement | null) {
  if (!button) return;
  if (!button.hidden) button.hidden = true;
  if (button.tabIndex !== -1) button.tabIndex = -1;
  if (button.getAttribute("aria-hidden") !== "true") button.setAttribute("aria-hidden", "true");
}

function ensureStatus(container: HTMLElement | null, key: string, text: string) {
  if (!container) return;
  let status = container.querySelector<HTMLElement>(`[data-automatic-status="${key}"]`);
  if (!status) {
    status = document.createElement("p");
    status.className = "automatic-mechanics-status";
    status.dataset.automaticStatus = key;
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    container.append(status);
  }
  if (status.textContent !== text) status.textContent = text;
}

function findButton(container: ParentNode, pattern: RegExp) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => pattern.test(button.textContent ?? "")) ?? null;
}

function syncReveal() {
  const phase = document.querySelector<HTMLElement>(".game-grid.phase-reveal .centered-phase");
  if (!phase) return;

  const advance = findButton(phase, /começar pistas/i);
  hideAutomationButton(advance);

  const progress = phase.querySelector<HTMLElement>(".seen-progress")?.textContent ?? "";
  const match = progress.match(/(\d+)\s*\/\s*(\d+)/);
  const seen = match ? Number(match[1]) : 0;
  const total = match ? Number(match[2]) : 0;
  const complete = total > 0 && seen >= total;
  ensureStatus(
    phase,
    "reveal",
    complete
      ? "Todos viram o papel. A discussão vai começar automaticamente."
      : "A discussão começa automaticamente assim que todos virem o próprio papel.",
  );
}

function syncDiscussion() {
  const side = document.querySelector<HTMLElement>(".game-grid.phase-discussion .discussion-side");
  if (!side) return;

  hideAutomationButton(side.querySelector<HTMLButtonElement>(".discussion-decision-trigger"));
  const directVoting = Array.from(side.querySelectorAll<HTMLButtonElement>(".phase-action"))
    .find((button) => /votar|votação/i.test(button.textContent ?? "")) ?? null;
  hideAutomationButton(directVoting);

  if (!side.querySelector(".decision-icon")) {
    ensureStatus(
      side,
      "discussion",
      "Quando o cronômetro terminar, todos escolhem entre mais tempo e votação. Ninguém precisa avançar a fase manualmente.",
    );
  }
}

function syncVoting() {
  const phase = document.querySelector<HTMLElement>(".game-grid.phase-voting .phase-content");
  if (!phase) return;

  const reveal = findButton(phase, /revelar resultado/i);
  hideAutomationButton(reveal);
  const voted = /voto confirmado/i.test(phase.querySelector<HTMLElement>(".vote-actions .primary-button")?.textContent ?? "");
  ensureStatus(
    phase,
    "voting",
    voted
      ? "Seu voto está confirmado. O resultado aparece automaticamente quando todos votarem ou o tempo acabar."
      : "O resultado é revelado automaticamente quando todos votarem ou o cronômetro chegar a zero.",
  );
}

function syncResultsCopy() {
  const description = document.querySelector<HTMLElement>(".game-grid.phase-results .results-content > .phase-description");
  if (!description) return;
  const normalized = description.textContent?.replace(/\s+/g, " ").trim() ?? "";
  if (/^O mais votado ficou entre os mais votados\.?$/i.test(normalized)) {
    description.textContent = "Ninguém foi eliminado nesta votação. Sem uma acusação válida, o impostor escapou.";
  }
}

export default function AutomaticMechanicsUi() {
  useEffect(() => {
    let frame: number | null = null;
    const inspect = () => {
      syncReveal();
      syncDiscussion();
      syncVoting();
      syncResultsCopy();
    };
    const schedule = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        inspect();
      });
    };

    inspect();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "disabled", "hidden"],
    });

    return () => {
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
