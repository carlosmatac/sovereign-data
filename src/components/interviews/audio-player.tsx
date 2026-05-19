"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";

/**
 * Top-of-page audio player for the interview detail view.
 *
 * Visual language:
 *   - Sovereign panel surface (#080F1E + tonal hairline border, 6px radius).
 *   - Amber `#FBBF24` accent on the play button + progress fill + thumb.
 *     This mirrors the per-utterance audio scrubbing in the transcript
 *     review editor, so "audio playback" reads as the same thing across
 *     the product. The amber is restrained — single-channel, never on
 *     more than one element at a time inside this card.
 *   - Mute button stays neutral so the amber stays meaningful (volume
 *     control is not the same semantic as scrubbing).
 *
 * Behaviour is unchanged: same play/pause, seek, mute, loading, error.
 */

const ACCENT = "#FBBF24"; // amber — audio playback semantic

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface AudioPlayerProps {
  src: string;
}

export function AudioPlayer({ src }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      void audio.play();
    }
  }, [playing]);

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const audio = audioRef.current;
      if (!audio) return;
      const value = parseFloat(e.target.value);
      audio.currentTime = value;
      setCurrentTime(value);
    },
    []
  );

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !muted;
    setMuted(!muted);
  }, [muted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => {
      if (isFinite(audio.duration)) setDuration(audio.duration);
      setLoading(false);
    };
    const onDurationChange = () => {
      if (isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onCanPlay = () => setLoading(false);
    const onError = () => {
      setLoading(false);
      setError(true);
    };
    const onEnded = () => setPlaying(false);

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("error", onError);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  if (error) {
    return (
      <div
        className="rounded-[6px] border px-4 py-3 text-[12.5px] text-muted-foreground"
        style={{
          background: "var(--sv-surface-bg)",
          borderColor: "var(--sv-border-panel)",
        }}
      >
        Audio file unavailable.
      </div>
    );
  }

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="rounded-[6px] border px-4 py-3"
      style={{
        background: "var(--sv-surface-bg)",
        borderColor: "var(--sv-border-panel)",
      }}
    >
      {/* Hidden native audio element */}
      <audio ref={audioRef} src={src} preload="metadata" />

      <div className="flex items-center gap-3">
        {/*
         * Play / Pause — bespoke 32px circular button using the amber
         * accent so the playback affordance reads instantly, in the
         * same visual family as the per-utterance play buttons in the
         * transcript review editor.
         */}
        <button
          type="button"
          onClick={togglePlay}
          disabled={loading}
          aria-label={playing ? "Pause" : "Play"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(251,191,36,0.55)] disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: "rgba(251,191,36,0.10)",
            borderColor: "rgba(251,191,36,0.32)",
            color: ACCENT,
          }}
        >
          {playing ? (
            <Pause className="h-3.5 w-3.5" fill="currentColor" strokeWidth={0} />
          ) : (
            <Play
              className="h-3.5 w-3.5 translate-x-[0.5px]"
              fill="currentColor"
              strokeWidth={0}
            />
          )}
        </button>

        {/* Current time */}
        <span
          className="w-10 shrink-0 text-right text-[11.5px] tabular-nums"
          style={{ color: "var(--sv-text-muted)" }}
        >
          {formatTime(currentTime)}
        </span>

        {/*
         * Progress bar — three-layer treatment:
         *   1. base track 3px (white @ 8%)
         *   2. amber fill 3px sized to progress
         *   3. transparent native <input type="range"> on top so the
         *      thumb + keyboard a11y come for free.
         * Mirrors the per-segment scrubbing in transcript-review-editor.
         */}
        <div className="relative flex h-8 flex-1 items-center">
          {loading ? (
            <div
              className="h-[3px] w-full animate-pulse rounded-full"
              style={{ background: "var(--sv-border-control)" }}
            />
          ) : (
            <>
              <div
                className="pointer-events-none absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full"
                style={{ background: "var(--sv-border-control)" }}
              />
              <div
                className="pointer-events-none absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full"
                style={{ width: `${progressPct}%`, background: ACCENT }}
              />
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={0.5}
                value={currentTime}
                onChange={handleSeek}
                aria-label="Seek"
                aria-valuemin={0}
                aria-valuemax={duration || 1}
                aria-valuenow={currentTime}
                className="
                  relative z-[1] h-8 w-full cursor-pointer appearance-none bg-transparent outline-none
                  focus-visible:ring-2 focus-visible:ring-[rgba(251,191,36,0.55)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sv-surface-bg)]
                  [&::-webkit-slider-runnable-track]:h-[3px] [&::-webkit-slider-runnable-track]:rounded-full
                  [&::-webkit-slider-runnable-track]:bg-transparent
                  [&::-webkit-slider-thumb]:mt-[calc((3px-10px)/2)]
                  [&::-webkit-slider-thumb]:h-[10px] [&::-webkit-slider-thumb]:w-[10px]
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:border-[2px] [&::-webkit-slider-thumb]:border-[var(--sv-surface-bg)]
                  [&::-webkit-slider-thumb]:bg-[#FBBF24]
                  [&::-moz-range-track]:h-[3px] [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent
                  [&::-moz-range-thumb]:h-[10px] [&::-moz-range-thumb]:w-[10px]
                  [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[2px]
                  [&::-moz-range-thumb]:border-[var(--sv-surface-bg)] [&::-moz-range-thumb]:bg-[#FBBF24]
                "
              />
            </>
          )}
        </div>

        {/* Duration */}
        <span
          className="w-10 shrink-0 text-[11.5px] tabular-nums"
          style={{ color: "var(--sv-text-muted)" }}
        >
          {duration > 0 ? formatTime(duration) : "—"}
        </span>

        {/*
         * Mute — kept neutral on purpose. The amber is reserved for the
         * playback semantic (play state + scrub progress); the mute
         * toggle is a different concept and shouldn't compete.
         */}
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? "Unmute" : "Mute"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(147,147,147,0.40)]"
          style={{
            borderColor: "var(--sv-border-surface-strong)",
            color: "var(--sv-text-muted)",
          }}
        >
          {muted ? (
            <VolumeX className="h-3.5 w-3.5" strokeWidth={1.6} />
          ) : (
            <Volume2 className="h-3.5 w-3.5" strokeWidth={1.6} />
          )}
        </button>
      </div>
    </div>
  );
}
