"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "../lib/supabase";

/* Voz ao vivo da sala. O áudio vai direto de um jogador para o outro (WebRTC);
   o Supabase Realtime só troca os sinais de conexão e avisa quem está na voz. */

export type VoiceState = { members: string[]; muted: string[]; speaking: string[] };
export const emptyVoiceState: VoiceState = { members: [], muted: [], speaking: [] };

type Signal = {
  from: string;
  to: string;
  kind: "offer" | "answer" | "candidate";
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

type Peer = {
  connection: RTCPeerConnection;
  audio: HTMLAudioElement;
  pending: RTCIceCandidateInit[];
  analyser: AnalyserNode | null;
};

type VoiceActions = { join: () => Promise<void>; leave: () => void; toggleMute: () => void };

const iceServers: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
const maxAttemptsPerPeer = 2;
const speakingThreshold = .045;

function isSpeaking(analyser: AnalyserNode | null) {
  if (!analyser) return false;
  const samples = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(samples);
  let sum = 0;
  for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
  return Math.sqrt(sum / samples.length) > speakingThreshold;
}

export default function VoiceChat({ roomCode, playerId, onState, onError }: {
  roomCode: string;
  playerId: string;
  onState: (state: VoiceState) => void;
  onError: (message: string) => void;
}) {
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [memberCount, setMemberCount] = useState(0);
  const actions = useRef<VoiceActions | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase.channel(`room-voice:${roomCode}`, { config: { broadcast: { self: false }, presence: { key: playerId } } });
    const peers = new Map<string, Peer>();
    const attempts = new Map<string, number>();
    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let localAnalyser: AnalyserNode | null = null;
    let speakingTimer: number | null = null;
    let inVoice = false;
    let micMuted = false;
    let members: string[] = [];
    let mutedMembers: string[] = [];
    let speaking: string[] = [];
    let disposed = false;

    const publish = () => onState({ members, muted: mutedMembers, speaking });
    const send = (signal: Signal) => void channel.send({ type: "broadcast", event: "signal", payload: signal });

    function makeAnalyser(source: MediaStream) {
      if (!audioContext) return null;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      audioContext.createMediaStreamSource(source).connect(analyser);
      return analyser;
    }

    function closePeer(id: string) {
      const peer = peers.get(id);
      if (!peer) return;
      peer.connection.onconnectionstatechange = null;
      peer.connection.close();
      peer.audio.srcObject = null;
      peers.delete(id);
    }

    function createPeer(id: string) {
      const connection = new RTCPeerConnection({ iceServers });
      const audio = new Audio();
      audio.autoplay = true;
      const peer: Peer = { connection, audio, pending: [], analyser: null };
      if (stream) for (const track of stream.getTracks()) connection.addTrack(track, stream);
      connection.onicecandidate = (event) => {
        if (event.candidate) send({ from: playerId, to: id, kind: "candidate", candidate: event.candidate.toJSON() });
      };
      connection.ontrack = (event) => {
        const [remote] = event.streams;
        if (!remote) return;
        audio.srcObject = remote;
        void audio.play().catch(() => undefined);
        peer.analyser = makeAnalyser(remote);
      };
      connection.onconnectionstatechange = () => {
        if (connection.connectionState !== "failed") return;
        closePeer(id);
        const used = (attempts.get(id) ?? 0) + 1;
        attempts.set(id, used);
        if (used <= maxAttemptsPerPeer) void connectToMembers();
        else onError("A voz não conectou com um dos jogadores nesta rede. O chat continua funcionando.");
      };
      peers.set(id, peer);
      return peer;
    }

    /* Quem tem o menor id faz a oferta: assim os dois lados nunca ofertam ao mesmo tempo. */
    async function connectToMembers() {
      if (!inVoice) return;
      for (const id of members) {
        if (id === playerId || peers.has(id) || (attempts.get(id) ?? 0) > maxAttemptsPerPeer) continue;
        const peer = createPeer(id);
        if (playerId > id) continue;
        try {
          await peer.connection.setLocalDescription(await peer.connection.createOffer());
          const description = peer.connection.localDescription;
          if (description) send({ from: playerId, to: id, kind: "offer", description: { type: description.type, sdp: description.sdp } });
        } catch {
          closePeer(id);
        }
      }
    }

    async function handleSignal(signal: Signal) {
      if (!inVoice || signal.to !== playerId || !signal.from) return;
      const peer = peers.get(signal.from) ?? createPeer(signal.from);
      try {
        if (signal.kind === "candidate" && signal.candidate) {
          if (peer.connection.remoteDescription) await peer.connection.addIceCandidate(signal.candidate);
          else peer.pending.push(signal.candidate);
          return;
        }
        if (!signal.description) return;
        await peer.connection.setRemoteDescription(signal.description);
        for (const candidate of peer.pending.splice(0)) await peer.connection.addIceCandidate(candidate);
        if (signal.kind === "offer") {
          await peer.connection.setLocalDescription(await peer.connection.createAnswer());
          const description = peer.connection.localDescription;
          if (description) send({ from: playerId, to: signal.from, kind: "answer", description: { type: description.type, sdp: description.sdp } });
        }
      } catch {
        closePeer(signal.from);
      }
    }

    function syncMembers() {
      const state = channel.presenceState() as Record<string, Array<{ muted?: unknown }>>;
      members = Object.keys(state);
      mutedMembers = members.filter((id) => Boolean(state[id]?.at(-1)?.muted));
      for (const id of Array.from(peers.keys())) {
        if (!members.includes(id)) { closePeer(id); attempts.delete(id); }
      }
      speaking = speaking.filter((id) => members.includes(id));
      setMemberCount(members.length);
      publish();
      void connectToMembers();
    }

    function watchSpeaking() {
      const current: string[] = [];
      if (!micMuted && isSpeaking(localAnalyser)) current.push(playerId);
      for (const [id, peer] of peers) if (!mutedMembers.includes(id) && isSpeaking(peer.analyser)) current.push(id);
      if (current.join() === speaking.join()) return;
      speaking = current;
      publish();
    }

    function releaseVoice() {
      inVoice = false;
      if (speakingTimer !== null) window.clearInterval(speakingTimer);
      speakingTimer = null;
      for (const id of Array.from(peers.keys())) closePeer(id);
      attempts.clear();
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      localAnalyser = null;
      void audioContext?.close().catch(() => undefined);
      audioContext = null;
      speaking = [];
    }

    actions.current = {
      async join() {
        if (inVoice) return;
        if (!navigator.mediaDevices?.getUserMedia) {
          onError("Este navegador não permite usar o microfone aqui.");
          return;
        }
        setConnecting(true);
        try {
          const captured = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
          if (disposed) { captured.getTracks().forEach((track) => track.stop()); return; }
          stream = captured;
          audioContext = new AudioContext();
          localAnalyser = makeAnalyser(captured);
          inVoice = true;
          micMuted = false;
          speakingTimer = window.setInterval(watchSpeaking, 200);
          setMuted(false);
          setJoined(true);
          await channel.track({ muted: false });
        } catch {
          onError("Libere o microfone no navegador para entrar na voz.");
        } finally {
          if (!disposed) setConnecting(false);
        }
      },
      leave() {
        if (!inVoice) return;
        releaseVoice();
        void channel.untrack();
        setJoined(false);
        setMuted(false);
        publish();
      },
      toggleMute() {
        if (!inVoice || !stream) return;
        micMuted = !micMuted;
        for (const track of stream.getAudioTracks()) track.enabled = !micMuted;
        setMuted(micMuted);
        void channel.track({ muted: micMuted });
      },
    };

    channel
      .on("presence", { event: "sync" }, syncMembers)
      .on("broadcast", { event: "signal" }, ({ payload }) => void handleSignal(payload as Signal))
      .subscribe();

    return () => {
      disposed = true;
      actions.current = null;
      releaseVoice();
      void channel.untrack();
      void supabase.removeChannel(channel);
      onState(emptyVoiceState);
    };
  }, [onError, onState, playerId, roomCode]);

  return <div className={`voice-chat ${joined ? "joined" : ""}`}>
    {!joined ? <button type="button" className="voice-join" disabled={connecting} onClick={() => void actions.current?.join()}>
      <VoiceIcon name="mic" /><span>{connecting ? "Conectando..." : "Entrar na voz"}</span>{memberCount > 0 && <b aria-label={`${memberCount} na voz`}>{memberCount}</b>}
    </button> : <>
      <button type="button" className={`voice-mic ${muted ? "muted" : ""}`} aria-pressed={muted} aria-label={muted ? "Ligar microfone" : "Desligar microfone"} onClick={() => actions.current?.toggleMute()}>
        <VoiceIcon name={muted ? "micOff" : "mic"} /><span>{muted ? "Mudo" : "Ligado"}</span>
      </button>
      <button type="button" className="voice-leave" aria-label="Sair da voz" onClick={() => actions.current?.leave()}>
        <VoiceIcon name="leave" /><span>Sair da voz</span>
      </button>
    </>}
  </div>;
}

function VoiceIcon({ name }: { name: "mic" | "micOff" | "leave" }) {
  const paths = {
    mic: "M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm7 8a7 7 0 0 1-14 0m7 7v3",
    micOff: "M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm7 8a7 7 0 0 1-14 0m7 7v3M4 4l16 16",
    leave: "M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5m5-4 4-4-4-4m4 4H9",
  };
  return <svg className="ui-icon" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
