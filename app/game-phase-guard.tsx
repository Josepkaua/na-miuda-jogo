"use client";

import { useEffect, useRef, useState } from "react";

const hardImpostorHints: Record<string, string[]> = {
  "Países": [
    "Pense em identidade, costumes ou imagem internacional. Muitas respostas ainda cabem aqui.",
    "Considere algo ligado a um país sem depender de clima, idioma ou continente específico.",
    "A resposta é conhecida fora de suas fronteiras, mas a pista não aponta uma região exata.",
  ],
  "Comidas": [
    "Pense mais na ocasião e na experiência de comer do que em ingredientes ou formato.",
    "Pode aparecer em contextos bem diferentes; evite apostar em doce, salgado, quente ou frio cedo demais.",
    "A resposta tem relação com alimentação, mas a pista não revela preparo, textura nem origem.",
  ],
  "Brasil": [
    "Pode ser lugar, costume, manifestação, símbolo ou algo muito associado ao país.",
    "Pense em algo reconhecível como brasileiro sem prender a resposta a uma região específica.",
    "A pista aponta para a identidade brasileira, mas várias áreas de cultura e cotidiano ainda servem.",
  ],
  "Futebol": [
    "Pode ser pessoa, lugar, regra, ação, competição ou elemento do jogo.",
    "Pense no universo do futebol sem assumir se a resposta acontece dentro ou fora de campo.",
    "A resposta é familiar para quem acompanha futebol, mas a pista não entrega sua função.",
  ],
  "Filmes e séries": [
    "Pense em algo conhecido por atmosfera, tema ou tipo de história, não por um personagem específico.",
    "A resposta pertence ao universo de filmes e séries, mas gênero e época continuam abertos.",
    "Pode ser reconhecida por uma ideia geral da obra; evite buscar uma cena ou detalhe famoso.",
  ],
  "Profissões": [
    "Pense na responsabilidade geral do trabalho, não em uma ferramenta ou local específico.",
    "A resposta envolve resolver problemas para outras pessoas, mas isso ainda vale para muitas carreiras.",
    "Considere o tipo de decisão e responsabilidade da profissão sem assumir uniforme, ambiente ou formação.",
  ],
  "Animais": [
    "Pense em comportamento, ambiente ou relação com outros seres vivos sem apostar em aparência específica.",
    "A pista é sobre um animal, mas tamanho, habitat e alimentação ainda estão em aberto.",
    "Considere uma característica ampla de sobrevivência ou comportamento; muitas espécies combinam com ela.",
  ],
  "Música": [
    "Pode ser estilo, instrumento, pessoa, evento ou forma de ouvir e produzir música.",
    "Pense na experiência musical em sentido amplo; a pista não define ritmo, instrumento ou época.",
    "A resposta se conecta à música, mas ainda pode estar no palco, no público ou na produção.",
  ],
  "Games": [
    "Pode ser jogo, plataforma, personagem, mecânica ou algo usado para jogar.",
    "Pense na experiência de jogar sem assumir gênero, console ou objetivo específico.",
    "A resposta é comum no universo dos games, mas a pista não separa jogo, hardware e mecânica.",
  ],
  "Objetos": [
    "Pense na função geral ou no contexto de uso, não em material, formato ou cômodo específico.",
    "É algo do cotidiano, mas tamanho, lugar e modo de uso continuam abertos.",
    "A resposta é um objeto reconhecível pela utilidade, porém a pista evita dizer exatamente para quê.",
  ],
  "Internet": [
    "Pode ser conteúdo, recurso, comportamento, formato ou algo que aparece em plataformas digitais.",
    "Pense em hábitos online sem assumir aplicativo, rede social ou tipo de mídia específico.",
    "A resposta faz parte da vida na internet, mas a pista não diz se é ferramenta, conteúdo ou fenômeno.",
  ],
  "Tudo misturado": [
    "A categoria não ajuda desta vez. Observe como os outros descrevem a resposta antes de se comprometer.",
    "A pista é propositalmente aberta: descubra primeiro se estão falando de lugar, pessoa, objeto, ação ou cultura.",
    "Não tente adivinhar cedo. Use as primeiras mensagens para descobrir que tipo de coisa está em jogo.",
  ],
};

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

function readVotingProgress() {
  const progress = document.querySelector<HTMLElement>(".game-grid.phase-voting .vote-progress > span")?.textContent ?? "";
  const match = progress.match(/(\d+)\s+de\s+(\d+)\s+votos confirmados/i);
  const confirmed = match ? Number(match[1]) : 0;
  const eligible = match ? Number(match[2]) : 0;
  return {
    confirmed,
    eligible,
    complete: eligible > 0 && confirmed >= eligible,
    expired: /encerra em\s+00:00/i.test(progress),
  };
}

function findRevealButton() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>(".game-grid.phase-voting .vote-actions button"))
    .find((button) => /revelar resultado/i.test(button.textContent ?? "")) ?? null;
}

function syncPointsLegend() {
  const note = document.querySelector<HTMLElement>(".game-grid.phase-results .points-note");
  if (!note) return;
  const text = "Pontuação: impostor vencedor +3 • equipe vencedora +2 • acertou um impostor no voto +1";
  if (note.textContent !== text) note.textContent = text;
}

function pickHardHint() {
  const category = document.querySelector<HTMLElement>(".category-chip strong")?.textContent?.trim() ?? "Tudo misturado";
  const options = hardImpostorHints[category] ?? hardImpostorHints["Tudo misturado"];
  const roundLabel = document.querySelector<HTMLElement>(".room-header h2")?.textContent ?? "";
  const seed = `${category}:${roundLabel}`.split("").reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return options[seed % options.length];
}

function replaceTextAfterLabel(container: HTMLElement | null, labelSelector: string, text: string) {
  if (!container) return;
  const label = container.querySelector<HTMLElement>(labelSelector);
  if (!label) return;
  let sibling = label.nextSibling;
  while (sibling) {
    const next = sibling.nextSibling;
    sibling.remove();
    sibling = next;
  }
  container.append(document.createTextNode(text));
}

function syncHardImpostorHints() {
  const impostorVisible = Array.from(document.querySelectorAll<HTMLElement>(".role-card.revealed > strong"))
    .some((element) => element.textContent?.trim() === "IMPOSTOR")
    || Boolean(document.querySelector(".impostor-tip"));
  if (!impostorVisible) return;

  const hint = pickHardHint();
  const roleHint = document.querySelector<HTMLElement>(".role-card.revealed .role-hint");
  replaceTextAfterLabel(roleHint, "b", hint);

  const discussionHint = document.querySelector<HTMLElement>(".impostor-tip p");
  replaceTextAfterLabel(discussionHint, "strong", hint);

  const secretRecheck = document.querySelector<HTMLElement>(".secret-recheck");
  if (/Impostor/i.test(secretRecheck?.querySelector("small")?.textContent ?? "")) {
    const paragraph = secretRecheck?.querySelector<HTMLElement>("p");
    if (paragraph && paragraph.textContent !== hint) paragraph.textContent = hint;
  }
}

export default function GamePhaseGuard() {
  const [transitionMessage, setTransitionMessage] = useState("");
  const lastGameState = useRef<{ key: string; phase: string } | null>(null);
  const actionLocks = useRef(new Set<string>());
  const autoAdvanceLocks = useRef(new Set<string>());
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
        autoAdvanceLocks.current.clear();
        return;
      }

      syncHardImpostorHints();

      const previous = lastGameState.current;
      if (previous && previous.key !== current.key) {
        actionLocks.current.clear();
        autoAdvanceLocks.current.clear();

        const staleNoticeClose = document.querySelector<HTMLButtonElement>(".toast button[aria-label='Fechar aviso']");
        staleNoticeClose?.click();

        if (previous.phase === "discussion" && current.phase === "voting") {
          setTransitionMessage("Tempo encerrado — abrindo a votação…");
          if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
          transitionTimer.current = window.setTimeout(() => setTransitionMessage(""), 3200);
        } else if (previous.phase === "voting" && current.phase === "results") {
          setTransitionMessage("Votos encerrados — revelando o resultado…");
          if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
          transitionTimer.current = window.setTimeout(() => setTransitionMessage(""), 3200);
        } else {
          setTransitionMessage("");
        }
      }

      lastGameState.current = current;

      if (current.phase === "voting") {
        const voting = readVotingProgress();
        const revealButton = findRevealButton();
        const autoKey = `${current.key}:auto-reveal`;
        if ((voting.complete || voting.expired) && revealButton && !revealButton.disabled && !autoAdvanceLocks.current.has(autoKey)) {
          autoAdvanceLocks.current.add(autoKey);
          setTransitionMessage(voting.complete ? "Todos votaram — revelando o resultado…" : "Tempo da votação encerrado — revelando o resultado…");
          window.setTimeout(() => {
            if (!revealButton.isConnected || revealButton.disabled) {
              autoAdvanceLocks.current.delete(autoKey);
              return;
            }
            revealButton.click();
          }, 120);
        }
      } else if (current.phase === "results") {
        syncPointsLegend();
      }
    };

    inspect();
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
      attributeFilter: ["class", "disabled"],
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
