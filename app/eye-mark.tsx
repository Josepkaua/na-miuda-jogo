"use client";

import { useEffect, useId, useRef } from "react";

/* Símbolo do jogo: um olho espiando pela fechadura. As partes animadas
   (pálpebra e íris) são controladas por CSS em game-ui.css. */
export default function EyeMark({ className = "", tracking = false }: { className?: string; tracking?: boolean }) {
  const root = useRef<SVGSVGElement>(null);
  const clipId = useId();

  useEffect(() => {
    if (!tracking) return;
    const canTrack = window.matchMedia("(hover: hover) and (prefers-reduced-motion: no-preference)");
    if (!canTrack.matches) return;
    let frame: number | null = null;
    const look = (event: PointerEvent) => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        const element = root.current;
        if (!element) return;
        const box = element.getBoundingClientRect();
        const dx = event.clientX - (box.left + box.width / 2);
        const dy = event.clientY - (box.top + box.height * .35);
        const distance = Math.max(1, Math.hypot(dx, dy));
        const reach = Math.min(1, distance / 320);
        element.style.setProperty("--look-x", `${(dx / distance) * reach * 13}px`);
        element.style.setProperty("--look-y", `${(dy / distance) * reach * 7}px`);
      });
    };
    window.addEventListener("pointermove", look);
    return () => {
      window.removeEventListener("pointermove", look);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [tracking]);

  return <svg ref={root} className={`eye-mark ${className}`} viewBox="0 0 120 150" aria-hidden="true">
    <defs><clipPath id={clipId}><path d="M22 52C36 28 84 28 98 52C84 76 36 76 22 52Z" /></clipPath></defs>
    <path className="eye-plate" d="M60 5a47 47 0 0 1 25 86.700l9.500 43.200a7 7 0 0 1-6.800 8.500H32.300a7 7 0 0 1-6.800-8.500l9.500-43.200A47 47 0 0 1 60 5Z" />
    <circle className="eye-socket" cx="60" cy="52" r="38" />
    <g className="eye-lid">
      <path className="eye-white" d="M22 52C36 28 84 28 98 52C84 76 36 76 22 52Z" />
      <g clipPath={`url(#${clipId})`}>
        <g className="eye-iris">
          <circle className="eye-iris-ring" cx="60" cy="52" r="18" />
          <circle className="eye-pupil" cx="60" cy="52" r="9" />
          <circle className="eye-glint" cx="66" cy="45" r="3.500" />
        </g>
      </g>
    </g>
  </svg>;
}
