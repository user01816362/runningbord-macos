import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { speakerDisplayName, useSpeakerNames } from "@/lib";

export interface LiveSegmentPayload {
  source: "system" | "mic";
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string;
}

export interface LivePartialPayload {
  source: "system" | "mic";
  text: string;
}

export function useLiveTranscriptLastLine(enabled: boolean) {
  const speakerNames = useSpeakerNames();
  const [lastSegment, setLastSegment] = useState<LiveSegmentPayload | null>(null);
  const [partial, setPartial] = useState<LivePartialPayload | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLastSegment(null);
      setPartial(null);
      return;
    }

    let cancelled = false;
    const unlisteners: (() => void)[] = [];

    listen<LiveSegmentPayload>("live-transcript-segment", ({ payload }) => {
      if (cancelled) return;
      setLastSegment(payload);
      setPartial((prev) => (prev?.source === payload.source ? null : prev));
    }).then((fn) => {
      if (cancelled) fn();
      else unlisteners.push(fn);
    });

    listen<LivePartialPayload>("live-transcript-partial", ({ payload }) => {
      if (cancelled) return;
      setPartial(payload);
    }).then((fn) => {
      if (cancelled) fn();
      else unlisteners.push(fn);
    });

    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => fn());
    };
  }, [enabled]);

  const activeSource = partial?.source || lastSegment?.source || "system";
  const rawSpeaker = lastSegment?.speaker;
  const speakerLabel =
    activeSource === "mic"
      ? "You"
      : speakerDisplayName(rawSpeaker ?? "Them", speakerNames);

  const displayText = partial?.text
    ? `${partial.text}…`
    : lastSegment?.text || "";

  return {
    hasText: Boolean(displayText.trim()),
    text: displayText,
    speaker: speakerLabel,
    source: activeSource,
    lastSegment,
    partial,
  };
}
