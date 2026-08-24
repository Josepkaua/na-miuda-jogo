"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

function subscribeOnlineStatus(onStoreChange: () => void) {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);
  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

function getOnlineSnapshot() {
  return navigator.onLine;
}

function getServerOnlineSnapshot() {
  return true;
}

export default function ConnectionStatus() {
  const online = useSyncExternalStore(subscribeOnlineStatus, getOnlineSnapshot, getServerOnlineSnapshot);
  const [restored, setRestored] = useState(false);
  const restoreTimer = useRef<number | null>(null);

  useEffect(() => {
    const handleOffline = () => {
      if (restoreTimer.current !== null) window.clearTimeout(restoreTimer.current);
      setRestored(false);
    };

    const handleOnline = () => {
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
