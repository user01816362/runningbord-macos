import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useApp } from "@/contexts";
import {
  aiProviderAcceptsAudio,
  captureMeetingAudio,
  useTranscriptionConfig,
} from "@/lib";
import { cn } from "@/lib/utils";
import { useLiveTranscriptLastLine, useWindowResize } from "@/hooks";
import {
  AudioLinesIcon,
  Volume2Icon,
  MicIcon,
  PlayIcon,
  Loader2Icon,
  SettingsIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  XIcon,
} from "lucide-react";

interface SystemAudioStatusResponse {
  recording: boolean;
  buffer_seconds: number;
  supported: boolean;
  current_seconds: number;
  is_audio_active: boolean;
}

/**
 * Meeting mode toggle: listens to meeting audio (and optionally the mic) and
 * transcribes it so the screenshot shortcut can include what was said.
 * Supports optional live audio activity meter, buffer status, and last heard sentence preview.
 */
export const MeetingModeToggle = () => {
  const {
    systemAudioDaemonConfig,
    setSystemAudioDaemonConfig,
    systemAudioError,
    allSttProviders,
    selectedSttProvider,
    allAiProviders,
    selectedAIProvider,
  } = useApp();

  const [transcriptionConfig] = useTranscriptionConfig();
  const showAudioActivity = transcriptionConfig.showAudioActivity !== false;
  const showLivePreview = transcriptionConfig.showLivePreview !== false;

  const enabled = systemAudioDaemonConfig.enabled;
  const failed = enabled && Boolean(systemAudioError);

  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const { resizeWindow } = useWindowResize();

  useEffect(() => {
    resizeWindow(isDetailsOpen);
  }, [isDetailsOpen, resizeWindow]);

  const [audioStatus, setAudioStatus] = useState<SystemAudioStatusResponse | null>(null);

  // Poll audio status periodically when enabled and showAudioActivity is on
  useEffect(() => {
    if (!enabled || !showAudioActivity) {
      setAudioStatus(null);
      return;
    }

    let active = true;
    const poll = async () => {
      try {
        const res = await invoke<SystemAudioStatusResponse>("system_audio_status");
        if (active) setAudioStatus(res);
      } catch {}
    };

    poll();
    const interval = setInterval(poll, 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [enabled, showAudioActivity]);

  const liveTranscript = useLiveTranscriptLastLine(enabled && showLivePreview);

  // Testing state inside popover
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isTestResultCollapsed, setIsTestResultCollapsed] = useState(false);

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    setIsTestResultCollapsed(false);
    try {
      const capture = await captureMeetingAudio({
        windowSeconds: systemAudioDaemonConfig.bufferSeconds,
        sttProvider: allSttProviders.find(
          (p) => p.id === selectedSttProvider.provider
        ),
        sttSelection: selectedSttProvider,
        aiAcceptsAudio: await aiProviderAcceptsAudio(
          allAiProviders.find((p) => p.id === selectedAIProvider.provider)
        ),
      });
      if (capture.transcript) {
        setTestResult(capture.transcript);
      } else if (capture.warning) {
        setTestResult(`Warning: ${capture.warning}`);
      } else {
        setTestResult(capture.audioBase64 ? "Raw audio captured." : "No speech detected.");
      }
    } catch (e: any) {
      setTestResult(`Error: ${e?.message || String(e)}`);
    } finally {
      setTesting(false);
    }
  };

  const toggle = () => {
    setSystemAudioDaemonConfig((prev) => ({ ...prev, enabled: !prev.enabled }));
    if (enabled) {
      setIsDetailsOpen(false);
    }
  };

  const currentSecs = Math.round(audioStatus?.current_seconds ?? 0);
  const targetSecs = audioStatus?.buffer_seconds ?? systemAudioDaemonConfig.bufferSeconds ?? 30;
  const isBuffering = audioStatus ? currentSecs < targetSecs : false;
  const isAudioActive = Boolean(audioStatus?.is_audio_active);

  const buttonTitle = failed
    ? `Meeting mode couldn't start: ${systemAudioError}`
    : !enabled
    ? "Turn on Meeting mode to include what's said in the meeting with screenshots"
    : showAudioActivity
    ? `Meeting mode on: listening.
• Buffer: ${isBuffering ? `${currentSecs}s / ${targetSecs}s filling` : `${targetSecs}s ready`}
• Sound: ${isAudioActive ? "Audio active (speaking detected)" : "Quiet"}
${liveTranscript.hasText ? `• Last heard (${liveTranscript.speaker}): "${liveTranscript.text}"` : ""}
(Press screenshot shortcut to send)`
    : "Meeting mode on: listening to the meeting. Press the screenshot shortcut to include what was said.";

  return (
    <div className="flex items-center gap-1">
      <Button
        size="icon"
        variant={failed ? "destructive" : enabled ? "default" : "ghost"}
        className="relative cursor-pointer"
        aria-pressed={enabled}
        title={buttonTitle}
        onClick={toggle}
      >
        <AudioLinesIcon className={`h-4 w-4 ${enabled ? "" : "opacity-60"}`} />
        {enabled && !failed && (
          <>
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2 ring-background transition-all",
                isAudioActive
                  ? "bg-emerald-400 ring-emerald-500/40 animate-ping"
                  : "bg-emerald-500 animate-pulse"
              )}
            />
            {showAudioActivity && isAudioActive && (
              <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 flex items-end gap-0.5 h-1.5 pointer-events-none">
                <span className="w-0.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0ms] h-1.5" />
                <span className="w-0.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:150ms] h-2" />
                <span className="w-0.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:300ms] h-1" />
              </span>
            )}
          </>
        )}
      </Button>

      {/* Optional Audio Buffer & Live Transcript Details Pill */}
      {enabled && !failed && (showAudioActivity || showLivePreview) && (
        <Popover open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 h-8 rounded-md text-[11px] font-mono transition-all cursor-pointer border select-none",
                isAudioActive
                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-medium"
                  : "bg-muted/40 border-input/40 text-muted-foreground hover:text-foreground"
              )}
              title="Meeting audio buffer and live transcript (click to view details)"
            >
              <span
                className={cn(
                  "size-1.5 rounded-full shrink-0",
                  isAudioActive ? "bg-emerald-400 animate-pulse" : "bg-emerald-500/80"
                )}
              />
              {showAudioActivity && (
                <span>{isBuffering ? `${currentSecs}s/${targetSecs}s` : `${targetSecs}s`}</span>
              )}
              {isAudioActive && <Volume2Icon className="size-3 animate-pulse text-emerald-500 shrink-0" />}
            </button>
          </PopoverTrigger>

          <PopoverContent
            align="end"
            side="bottom"
            sideOffset={6}
            className="w-80 p-3.5 space-y-3 bg-popover/95 backdrop-blur-xl border border-input/60 shadow-xl rounded-xl"
          >
            {/* Header: Buffer status */}
            <div className="flex items-center justify-between pb-1.5 border-b border-input/30">
              <div className="flex items-center gap-1.5">
                <AudioLinesIcon className="size-4 text-primary" />
                <span className="text-xs font-semibold text-foreground">Meeting Audio</span>
              </div>
              <div className="flex items-center gap-1">
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full font-medium border",
                    isAudioActive
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                      : "bg-muted text-muted-foreground border-input/40"
                  )}
                >
                  {isAudioActive ? "Audio Active" : "Quiet"}
                </span>
              </div>
            </div>

            {/* Buffer progress bar */}
            {showAudioActivity && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                  <span>Buffer Window</span>
                  <span>{isBuffering ? `${currentSecs}s / ${targetSecs}s filling` : `${targetSecs}s ready`}</span>
                </div>
                <div className="w-full bg-muted/60 h-1.5 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all duration-500 rounded-full",
                      isBuffering ? "bg-amber-500" : "bg-emerald-500"
                    )}
                    style={{
                      width: `${Math.min(100, Math.max(5, Math.round((currentSecs / targetSecs) * 100)))}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Live Transcript (Last Heard) */}
            {showLivePreview && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="font-semibold text-foreground flex items-center gap-1">
                    <MicIcon className="size-3 text-primary" /> Last Heard
                  </span>
                  {liveTranscript.hasText && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Live</span>
                  )}
                </div>
                <div className="bg-muted/40 border border-input/40 rounded-lg p-2.5 text-xs min-h-[50px] flex items-center">
                  {liveTranscript.hasText ? (
                    <p className="leading-relaxed break-words">
                      <span className="font-semibold text-primary">{liveTranscript.speaker}: </span>
                      <span className="text-foreground/90">{liveTranscript.text}</span>
                    </p>
                  ) : (
                    <p className="text-muted-foreground/70 italic text-center w-full text-[11px]">
                      Listening for speech... (speak or play audio)
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Quick Test & Settings */}
            <div className="pt-1 border-t border-input/30 flex items-center justify-between gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={runTest}
                disabled={testing}
                className="h-7 text-xs px-2 cursor-pointer"
              >
                {testing ? (
                  <Loader2Icon className="size-3 animate-spin mr-1" />
                ) : (
                  <PlayIcon className="size-3 mr-1" />
                )}
                Test now
              </Button>

              <button
                type="button"
                onClick={() => {
                  invoke("open_dashboard").catch(() => {});
                  setIsDetailsOpen(false);
                }}
                className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors cursor-pointer"
              >
                <SettingsIcon className="size-3" />
                Meeting settings
              </button>
            </div>

            {testResult && (
              <div className="rounded-lg bg-muted/40 border border-input/40 overflow-hidden text-[11px]">
                <div className="flex items-center justify-between px-2.5 py-1.5 bg-muted/70 border-b border-input/30 text-[10px] text-muted-foreground font-medium select-none">
                  <span className="flex items-center gap-1 text-foreground font-semibold">
                    <AudioLinesIcon className="size-3 text-primary" />
                    Test Transcript
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setIsTestResultCollapsed((prev) => !prev)}
                      className="p-1 hover:text-foreground hover:bg-muted rounded transition-colors cursor-pointer"
                      title={isTestResultCollapsed ? "Show transcript" : "Collapse transcript"}
                    >
                      {isTestResultCollapsed ? (
                        <ChevronDownIcon className="size-3" />
                      ) : (
                        <ChevronUpIcon className="size-3" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTestResult(null)}
                      className="p-1 hover:text-foreground hover:bg-muted rounded transition-colors cursor-pointer"
                      title="Close test result"
                    >
                      <XIcon className="size-3" />
                    </button>
                  </div>
                </div>
                {!isTestResultCollapsed && (
                  <div className="p-2.5 text-foreground max-h-28 overflow-auto whitespace-pre-wrap font-mono text-[10.5px] leading-relaxed">
                    {testResult}
                  </div>
                )}
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
};
