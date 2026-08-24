"use client";

import { useEffect, useRef, useState } from "react";

export default function ConnectionStatus() {
  const [online, setOnline] = useState(true);
  const [restored, setRestored] = useState(false);
  const restoreTimer = useRef<number | null>(null);

  useEffect(() => {
    setOnline(navigator.onLine);

    const handleOffline = () => {
      if (restoreTimer.current !== null) window.clearTimeout(restoreTimer.current);
      setRestored(false);
      setOnline(false);
    };

    const handleOnline = () => {
      setOnline(true);
      setRestored(true);
      if (restoreTimer.current !== null) window.clearTimeout(restoreTimer.current);
      restoreTimer.current = window.setTimeout(() => setRestored(false), 2600);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      if (restoreTimer.current !== null) window.clearTimeout(restoreTimer.current);
    };
  }, []);

  if (online && !restored) return null;

  return (
    <div
      className={`connection-status ${online ? "restored" : "offline"}`}
      role="status"
      aria-live="assertive"
    >
      <span aria-hidden="true">{online ? "✓" : "↻"}</span>
      <div>
        <strong>{online ? "Conexão restabelecida" : "Você está sem internet"}</strong>
        <small>{online ? "A partida volta a sincronizar normalmente." : "Tentando reconectar. Não feche a sala."}</small>
      </div>
    </div>
  );
}
