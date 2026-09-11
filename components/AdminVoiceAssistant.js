"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import logo from "@/app/logo.jpg";

const STATUS_CONTENT = {
  idle: {
    title: "Ready when you are",
    detail: "Tap once, then speak naturally in Hindi, Hinglish, or English.",
  },
  connecting: {
    title: "Connecting…",
    detail: "Please wait a moment while the microphone starts.",
  },
  listening: {
    title: "Listening",
    detail: "बोलिए — you can interrupt the assistant at any time.",
  },
  thinking: {
    title: "Thinking…",
    detail: "The assistant is preparing a response.",
  },
  checking: {
    title: "Checking operations data…",
    detail: "Looking up the current authenticated admin information.",
  },
  speaking: {
    title: "Speaking",
    detail: "You can start talking to interrupt the response.",
  },
  muted: {
    title: "Microphone muted",
    detail: "Tap Unmute when you are ready to continue.",
  },
  ended: {
    title: "Conversation ended",
    detail: "Tap below whenever you want to talk again.",
  },
  error: {
    title: "Couldn’t start voice",
    detail: "Check the message below, then try again.",
  },
};

const parseResponseError = async (response) => {
  const body = await response.text();
  if (response.ok) return body;
  try {
    const payload = JSON.parse(body);
    throw new Error(payload.error || "Could not start the voice session.");
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(body || "Could not start the voice session.");
    throw error;
  }
};

const getFunctionCalls = (event) => {
  const calls = [];
  const add = (item) => {
    if (item?.type !== "function_call" || item.name !== "consult_operations_assistant") return;
    calls.push({
      call_id: item.call_id,
      name: item.name,
      arguments: item.arguments || "{}",
    });
  };

  if (event.type === "response.function_call_arguments.done") {
    add({
      type: "function_call",
      call_id: event.call_id,
      name: event.name,
      arguments: event.arguments,
    });
  }
  if (event.type === "response.output_item.done" || event.type === "conversation.item.created") {
    add(event.item);
  }
  if (event.type === "response.done") {
    (event.response?.output || []).forEach(add);
  }
  return calls;
};

const MicrophoneIcon = ({ muted = false }) => (
  <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    {!muted ? <path d="M5 11a7 7 0 0 0 14 0" /> : <path d="m4 4 16 16" />}
    <path d="M12 18v3" />
    <path d="M9 21h6" />
  </svg>
);

export default function AdminVoiceAssistant({
  configured = false,
  microphoneBusy = false,
  onActiveChange,
  onOperationsQuery,
  actionAnnouncement,
  children,
}) {
  const [status, setStatus] = useState("idle");
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [userCaption, setUserCaption] = useState("");
  const [assistantCaption, setAssistantCaption] = useState("");
  const [sessionError, setSessionError] = useState("");
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [memoryStatus, setMemoryStatus] = useState("ready");
  const [memoryNotice, setMemoryNotice] = useState("");

  const remoteAudioRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const dataChannelRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const connectionTimerRef = useRef(null);
  const disconnectTimerRef = useRef(null);
  const activeRef = useRef(false);
  const endingRef = useRef(false);
  const mountedRef = useRef(true);
  const processedCallIdsRef = useRef(new Set());
  const toolCallsInFlightRef = useRef(0);
  const userPartialRef = useRef("");
  const assistantPartialRef = useRef("");
  const onOperationsQueryRef = useRef(onOperationsQuery);
  const onActiveChangeRef = useRef(onActiveChange);
  const lastAnnouncementRef = useRef("");
  const memorySessionIdRef = useRef("");
  const persistedTurnIdsRef = useRef(new Set());

  useEffect(() => {
    onOperationsQueryRef.current = onOperationsQuery;
  }, [onOperationsQuery]);

  useEffect(() => {
    onActiveChangeRef.current = onActiveChange;
  }, [onActiveChange]);

  const sendRealtimeEvent = useCallback((event) => {
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== "open") return false;
    channel.send(JSON.stringify(event));
    return true;
  }, []);

  const persistVoiceTurn = useCallback(async ({ role, text, turnId }) => {
    const transcript = String(text || "").trim();
    if (!transcript || !memorySessionIdRef.current) return;

    const stableTurnId = String(turnId || `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const dedupeKey = `${role}:${stableTurnId}`;
    if (persistedTurnIdsRef.current.has(dedupeKey)) return;
    persistedTurnIdsRef.current.add(dedupeKey);

    try {
      const response = await fetch("/api/admin/assistant/voice-memory", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: memorySessionIdRef.current,
          turnId: stableTurnId,
          role,
          text: transcript,
        }),
      });
      if (!response.ok) throw new Error("Voice memory could not be saved.");
      if (mountedRef.current) setMemoryStatus("ready");
    } catch {
      persistedTurnIdsRef.current.delete(dedupeKey);
      if (mountedRef.current) setMemoryStatus("unavailable");
    }
  }, []);

  const closeSession = useCallback(({ nextStatus = "ended", errorMessage = "", updateUi = true } = {}) => {
    endingRef.current = true;
    activeRef.current = false;
    window.clearTimeout(connectionTimerRef.current);
    window.clearTimeout(disconnectTimerRef.current);

    const channel = dataChannelRef.current;
    dataChannelRef.current = null;
    if (channel) {
      channel.onopen = null;
      channel.onclose = null;
      channel.onerror = null;
      channel.onmessage = null;
      if (channel.readyState !== "closed") channel.close();
    }

    const peer = peerConnectionRef.current;
    peerConnectionRef.current = null;
    if (peer) {
      peer.ontrack = null;
      peer.onconnectionstatechange = null;
      peer.close();
    }

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
    }

    processedCallIdsRef.current.clear();
    toolCallsInFlightRef.current = 0;
    userPartialRef.current = "";
    assistantPartialRef.current = "";
    onActiveChangeRef.current?.(false);

    if (updateUi && mountedRef.current) {
      setIsSessionActive(false);
      setIsMuted(false);
      setPlaybackBlocked(false);
      setStatus(nextStatus);
      setSessionError(errorMessage);
    }
  }, []);

  const handleFunctionCall = useCallback(async (call) => {
    const callId = String(call?.call_id || "");
    if (!callId || processedCallIdsRef.current.has(callId)) return;
    processedCallIdsRef.current.add(callId);
    toolCallsInFlightRef.current += 1;
    setStatus("checking");
    setSessionError("");

    let question = "";
    try {
      const args = JSON.parse(call.arguments || "{}");
      question = String(args.question || "").trim();
    } catch {
      question = "";
    }

    try {
      if (!question) throw new Error("I could not understand the operations request. Please say it again.");
      if (typeof onOperationsQueryRef.current !== "function") {
        throw new Error("The operations assistant is unavailable.");
      }

      const result = await onOperationsQueryRef.current(question);
      const output = {
        ok: true,
        answer: String(result?.answer || "").slice(0, 12000),
        actions: (Array.isArray(result?.actions) ? result.actions : []).slice(0, 10).map((action) => ({
          summary: String(action.summary || "").slice(0, 500),
          status: action.status || "proposed",
          requires_touch_confirmation: action.status === "proposed",
        })),
      };
      sendRealtimeEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(output),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The operations lookup failed.";
      setSessionError(message);
      sendRealtimeEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify({ ok: false, error: message }),
        },
      });
    } finally {
      toolCallsInFlightRef.current = Math.max(0, toolCallsInFlightRef.current - 1);
      sendRealtimeEvent({ type: "response.create" });
    }
  }, [sendRealtimeEvent]);

  const handleRealtimeEvent = useCallback((event) => {
    const functionCalls = getFunctionCalls(event);
    functionCalls.forEach((call) => void handleFunctionCall(call));

    if (event.type === "conversation.item.input_audio_transcription.delta") {
      userPartialRef.current += event.delta || "";
      setUserCaption(userPartialRef.current.trim());
    }
    if (event.type === "conversation.item.input_audio_transcription.completed") {
      const transcript = String(event.transcript || userPartialRef.current || "").trim();
      if (transcript) {
        setUserCaption(transcript);
        void persistVoiceTurn({
          role: "user",
          text: transcript,
          turnId: event.item_id || event.item?.id,
        });
      }
      userPartialRef.current = "";
    }
    if (event.type === "conversation.item.input_audio_transcription.failed") {
      setSessionError("Live captions paused, but you can keep talking.");
    }

    if (event.type === "response.output_audio_transcript.delta" || event.type === "response.audio_transcript.delta") {
      assistantPartialRef.current += event.delta || "";
      setAssistantCaption(assistantPartialRef.current.trim());
      setStatus("speaking");
    }
    if (event.type === "response.output_audio_transcript.done" || event.type === "response.audio_transcript.done") {
      const transcript = String(event.transcript || assistantPartialRef.current || "").trim();
      if (transcript) {
        setAssistantCaption(transcript);
        void persistVoiceTurn({
          role: "assistant",
          text: transcript,
          turnId: event.item_id || event.item?.id || event.response_id,
        });
      }
      assistantPartialRef.current = "";
    }

    if (event.type === "input_audio_buffer.speech_started") {
      userPartialRef.current = "";
      setUserCaption("");
      setStatus("listening");
    }
    if (event.type === "input_audio_buffer.speech_stopped" || event.type === "response.created") {
      if (!toolCallsInFlightRef.current) setStatus("thinking");
    }
    if (
      event.type === "output_audio_buffer.started" ||
      event.type === "response.output_audio.delta" ||
      event.type === "response.audio.delta"
    ) {
      setStatus("speaking");
    }
    if (event.type === "output_audio_buffer.stopped") {
      setStatus("listening");
    }

    if (event.type === "response.done") {
      if (event.response?.status === "failed") {
        const message = event.response?.status_details?.error?.message || "The voice response failed. Please try again.";
        closeSession({ nextStatus: "error", errorMessage: message });
      } else if (!functionCalls.length && !toolCallsInFlightRef.current) {
        setStatus("listening");
      }
    }

    if (event.type === "error") {
      const message = event.error?.message || "The voice session stopped unexpectedly.";
      closeSession({ nextStatus: "error", errorMessage: message });
    }
  }, [closeSession, handleFunctionCall, persistVoiceTurn]);

  const startSession = useCallback(async () => {
    if (!configured || microphoneBusy || status === "connecting" || activeRef.current) return;
    if (!window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setSessionError("This browser does not support realtime microphone conversations.");
      return;
    }

    endingRef.current = false;
    setStatus("connecting");
    setSessionError("");
    setUserCaption("");
    setAssistantCaption("");
    setPlaybackBlocked(false);
    setMemoryNotice("");
    memorySessionIdRef.current = window.crypto?.randomUUID?.() || `voice-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    persistedTurnIdsRef.current.clear();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const peer = new RTCPeerConnection();
      peerConnectionRef.current = peer;
      stream.getAudioTracks().forEach((track) => peer.addTrack(track, stream));

      peer.ontrack = (trackEvent) => {
        const remoteStream = trackEvent.streams?.[0] || new MediaStream([trackEvent.track]);
        if (!remoteAudioRef.current) return;
        remoteAudioRef.current.srcObject = remoteStream;
        void remoteAudioRef.current.play().then(() => {
          if (mountedRef.current) setPlaybackBlocked(false);
        }).catch(() => {
          if (mountedRef.current) setPlaybackBlocked(true);
        });
      };

      peer.onconnectionstatechange = () => {
        window.clearTimeout(disconnectTimerRef.current);
        if (peer.connectionState === "failed") {
          closeSession({ nextStatus: "error", errorMessage: "The voice connection failed. Please try again." });
        }
        if (peer.connectionState === "disconnected" && !endingRef.current) {
          setStatus("connecting");
          disconnectTimerRef.current = window.setTimeout(() => {
            if (peer.connectionState === "disconnected") {
              closeSession({ nextStatus: "error", errorMessage: "The voice connection was interrupted." });
            }
          }, 3500);
        }
        if (peer.connectionState === "connected" && activeRef.current) setStatus("listening");
      };

      const channel = peer.createDataChannel("oai-events");
      dataChannelRef.current = channel;
      channel.onmessage = (message) => {
        try {
          handleRealtimeEvent(JSON.parse(message.data));
        } catch {
          // Ignore malformed or non-JSON data-channel messages.
        }
      };
      channel.onerror = () => {
        closeSession({ nextStatus: "error", errorMessage: "The voice connection encountered an error." });
      };
      channel.onclose = () => {
        if (!endingRef.current) {
          closeSession({ nextStatus: "error", errorMessage: "The voice connection closed unexpectedly." });
        }
      };
      channel.onopen = () => {
        window.clearTimeout(connectionTimerRef.current);
        activeRef.current = true;
        onActiveChangeRef.current?.(true);
        if (mountedRef.current) {
          setIsSessionActive(true);
          setStatus("thinking");
        }
        sendRealtimeEvent({ type: "response.create" });
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const response = await fetch("/api/admin/assistant/voice-session", {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: offer.sdp,
      });
      setMemoryStatus(response.headers.get("X-GGH-Voice-Memory") === "unavailable" ? "unavailable" : "ready");
      const answerSdp = await parseResponseError(response);
      await peer.setRemoteDescription({ type: "answer", sdp: answerSdp });

      connectionTimerRef.current = window.setTimeout(() => {
        if (!activeRef.current) {
          closeSession({ nextStatus: "error", errorMessage: "The voice connection timed out. Please try again." });
        }
      }, 15000);
    } catch (error) {
      const message = error?.name === "NotAllowedError"
        ? "Microphone access was denied. Allow microphone access in Safari or your browser settings, then try again."
        : error?.name === "NotFoundError"
          ? "No microphone was found on this device."
          : error instanceof Error
            ? error.message
            : "Could not start the voice session.";
      closeSession({ nextStatus: "error", errorMessage: message });
    }
  }, [closeSession, configured, handleRealtimeEvent, microphoneBusy, sendRealtimeEvent, status]);

  const toggleMute = () => {
    const nextMuted = !isMuted;
    mediaStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
    setStatus(nextMuted ? "muted" : "listening");
  };

  const enablePlayback = async () => {
    try {
      await remoteAudioRef.current?.play();
      setPlaybackBlocked(false);
    } catch {
      setSessionError("Audio is still blocked. Check that the iPad is not muted, then tap again.");
    }
  };

  const clearVoiceMemory = async () => {
    if (activeRef.current || memoryStatus === "clearing") return;
    if (!window.confirm("Clear all remembered voice conversations for this admin account?")) return;
    setMemoryStatus("clearing");
    setMemoryNotice("");
    try {
      const response = await fetch("/api/admin/assistant/voice-memory", { method: "DELETE" });
      if (!response.ok) throw new Error("Could not clear voice memory.");
      setMemoryStatus("ready");
      setMemoryNotice("Past voice memory cleared.");
    } catch (error) {
      setMemoryStatus("unavailable");
      setMemoryNotice(error instanceof Error ? error.message : "Could not clear voice memory.");
    }
  };

  useEffect(() => {
    const announcementId = String(actionAnnouncement?.id || "");
    const announcementText = String(actionAnnouncement?.text || "").trim();
    if (!announcementId || !announcementText || announcementId === lastAnnouncementRef.current || !activeRef.current) return;
    lastAnnouncementRef.current = announcementId;
    sendRealtimeEvent({
      type: "response.create",
      response: {
        instructions: `A trusted system result is now available: ${announcementText}\nGive one short spoken acknowledgement in the language the user has been speaking. Do not call a tool.`,
      },
    });
  }, [actionAnnouncement, sendRealtimeEvent]);

  useEffect(() => {
    const handlePageHide = () => closeSession({ updateUi: false });
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [closeSession]);

  useEffect(() => () => {
    mountedRef.current = false;
    closeSession({ updateUi: false });
  }, [closeSession]);

  const effectiveStatus = isMuted && isSessionActive && status !== "speaking" ? "muted" : status;
  const statusContent = STATUS_CONTENT[effectiveStatus] || STATUS_CONTENT.idle;
  const isConnecting = status === "connecting";
  const showActiveOrb = isSessionActive || isConnecting;
  const startDisabled = !configured || microphoneBusy || isConnecting;
  const buttonLabel = status === "ended" || status === "error" ? "Talk again / फिर से बात करें" : "Start talking / बात शुरू करें";
  const ringClass = useMemo(() => {
    if (effectiveStatus === "speaking") return "bg-secondary/30 scale-110";
    if (effectiveStatus === "checking") return "bg-[#d9a25f]/30 animate-pulse";
    if (effectiveStatus === "connecting" || effectiveStatus === "thinking") return "bg-primary/15 animate-pulse";
    if (effectiveStatus === "muted") return "bg-base-300";
    return "bg-accent/25 animate-pulse";
  }, [effectiveStatus]);

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-[#d1c4b0] bg-[#fffdf8] text-[#213a2f] shadow-[0_24px_70px_rgba(53,90,69,0.14)]">
      <div className="pointer-events-none absolute -left-24 -top-28 h-72 w-72 rounded-full bg-[#eef3e8]" />
      <div className="pointer-events-none absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-[#f4d8c8]/55" />
      <div className="pointer-events-none absolute right-[12%] top-24 h-24 w-24 rotate-12 rounded-[2rem] border border-[#ddcfb6]/60" />
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      <div className="relative z-[1] flex min-h-[30rem] flex-col px-5 py-6 sm:px-8 sm:py-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Image src={logo} alt="Good Gut Hut" width={52} height={52} className="h-12 w-12 rounded-full border border-[#d1c4b0] object-cover shadow-sm" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#8b5d39]">Good Gut Hut</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Voice assistant</h2>
              <p className="mt-1 text-sm text-[#51685d]">Hindi · Hinglish · English</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2 rounded-full border border-[#cad8c5] bg-[#eef3e8] px-3 py-2 text-xs font-bold text-[#355a45]">
              <span className={`h-2.5 w-2.5 rounded-full ${isSessionActive ? "bg-[#6f9a74]" : isConnecting ? "animate-pulse bg-[#d9a25f]" : "bg-[#9aae9f]"}`} />
              {isSessionActive ? (isMuted ? "Mic muted" : "Live") : isConnecting ? "Connecting" : "Ready"}
            </div>
            <div className="flex items-center gap-2 text-xs text-[#51685d]">
              <span className={`rounded-full border px-2.5 py-1 font-semibold ${memoryStatus === "unavailable" ? "border-[#d9898a] bg-[#fff1ed] text-[#8a453f]" : "border-[#ddcfb6] bg-[#f8f4ea]"}`}>
                {memoryStatus === "unavailable" ? "Memory paused" : memoryStatus === "clearing" ? "Clearing memory…" : "Memory on"}
              </span>
              <button
                type="button"
                className="underline decoration-[#d1c4b0] underline-offset-4 hover:text-primary disabled:cursor-not-allowed disabled:opacity-45"
                onClick={clearVoiceMemory}
                disabled={isSessionActive || memoryStatus === "clearing"}
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center" aria-live="polite">
          <div className="relative grid h-44 w-44 place-items-center sm:h-52 sm:w-52">
            {showActiveOrb ? (
              <>
                <span className={`absolute inset-0 rounded-full transition duration-500 ${ringClass}`} />
                <span className="absolute inset-5 rounded-full bg-[#cad8c5]/70 blur-sm" />
                <span className="relative grid h-28 w-28 place-items-center rounded-full border border-[#66806e] bg-[#355a45] text-[#fffdf8] shadow-[0_18px_40px_rgba(53,90,69,0.28)] sm:h-32 sm:w-32">
                  {isConnecting || effectiveStatus === "thinking" || effectiveStatus === "checking" ? (
                    <span className="loading loading-spinner loading-lg text-[#fffdf8]" />
                  ) : (
                    <MicrophoneIcon muted={isMuted} />
                  )}
                </span>
              </>
            ) : (
              <div
                className="grid h-40 w-40 place-items-center rounded-full border border-[#cad8c5] bg-[#eef3e8] shadow-[0_18px_45px_rgba(53,90,69,0.12)] sm:h-44 sm:w-44"
                aria-hidden="true"
              >
                <span className="grid h-24 w-24 place-items-center rounded-full bg-[#355a45] text-[#fffdf8] shadow-xl">
                  <MicrophoneIcon />
                </span>
              </div>
            )}
          </div>

          <h3 className="mt-4 text-xl font-semibold sm:text-2xl">{statusContent.title}</h3>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-[#51685d] sm:text-base">{statusContent.detail}</p>

          {!showActiveOrb ? (
            <button
              type="button"
              className="btn btn-primary mt-6 min-h-14 rounded-2xl px-7 text-base font-bold shadow-[0_12px_28px_rgba(53,90,69,0.24)]"
              onClick={startSession}
              disabled={startDisabled}
            >
              {buttonLabel}
            </button>
          ) : null}

          {microphoneBusy && !isSessionActive ? <p className="mt-4 text-sm font-medium text-[#8b5d39]">Finish text dictation before starting voice.</p> : null}
          {!configured ? <p className="mt-4 text-sm font-medium text-[#8b5d39]">Voice needs OPENAI_API_KEY configuration.</p> : null}
          {sessionError ? <div className="mt-4 max-w-xl rounded-2xl border border-[#d9898a] bg-[#fff1ed] px-4 py-3 text-sm text-[#7a3f3f]">{sessionError}</div> : null}

          {isSessionActive ? (
            <div className="mt-7 flex items-center justify-center gap-4">
              <button type="button" className="btn min-h-14 rounded-2xl border-[#cad8c5] bg-[#fffdf8] px-5 text-[#355a45] hover:border-primary hover:bg-[#eef3e8]" onClick={toggleMute}>
                <MicrophoneIcon muted={isMuted} />
                <span>{isMuted ? "Unmute / माइक चालू" : "Mute / माइक बंद"}</span>
              </button>
              <button type="button" className="btn min-h-14 rounded-2xl border-[#bd7273] bg-[#d9898a] px-5 text-[#3f2020] hover:border-[#a95f60] hover:bg-[#cf7b7c]" onClick={() => closeSession()}>
                <span className="h-4 w-4 rounded-sm bg-current" aria-hidden="true" />
                <span>End / बंद करें</span>
              </button>
            </div>
          ) : null}

          {playbackBlocked ? (
            <button type="button" className="btn btn-warning mt-4 min-h-12 rounded-2xl" onClick={enablePlayback}>
              Tap to hear the assistant
            </button>
          ) : null}
        </div>

        {(userCaption || assistantCaption) ? (
          <div className="grid gap-3 rounded-2xl border border-[#ddcfb6] bg-[#f8f4ea]/90 p-4 text-left sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#8b5d39]">You</p>
              <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-[#40584c]">{userCaption || "Listening…"}</p>
            </div>
            <div className="border-t border-[#ddcfb6] pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-primary">Assistant</p>
              <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-[#40584c]">{assistantCaption || "Thinking…"}</p>
            </div>
          </div>
        ) : null}

        {children ? (
          <div className="mt-4 rounded-2xl bg-base-100 p-1 text-base-content">
            {children}
          </div>
        ) : null}

        {memoryNotice ? <p className={`mt-3 text-center text-xs font-medium ${memoryStatus === "unavailable" ? "text-[#8a453f]" : "text-primary"}`}>{memoryNotice}</p> : null}
        <p className="mt-4 text-center text-xs text-[#6f7f76]">Remembers completed voice transcripts for this admin account. Database changes still require a tap on Confirm action.</p>
      </div>
    </section>
  );
}
