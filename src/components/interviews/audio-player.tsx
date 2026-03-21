"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
      <Card>
        <CardContent className="px-4 py-3 text-sm text-muted-foreground">
          Audio file unavailable.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="px-4 py-3">
        {/* Hidden native audio element */}
        <audio ref={audioRef} src={src} preload="metadata" />

        <div className="flex items-center gap-3">
          {/* Play / Pause */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full"
            onClick={togglePlay}
            disabled={loading}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>

          {/* Current time */}
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {formatTime(currentTime)}
          </span>

          {/* Progress bar — input taller than track so thumb centers on track (WebKit/Firefox) */}
          <div className="relative flex h-8 flex-1 items-center">
            {loading ? (
              <div className="h-0.5 w-full animate-pulse rounded-full bg-muted" />
            ) : (
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={0.5}
                value={currentTime}
                onChange={handleSeek}
                aria-label="Seek"
                className="
                  h-8 w-full cursor-pointer appearance-none rounded-full bg-transparent
                  accent-foreground outline-none
                  focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background
                  [&::-webkit-slider-runnable-track]:h-0.5 [&::-webkit-slider-runnable-track]:rounded-full
                  [&::-webkit-slider-runnable-track]:bg-transparent
                  [&::-webkit-slider-thumb]:mt-[calc((0.125rem-0.75rem)/2)]
                  [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-foreground
                  [&::-webkit-slider-thumb]:shadow-sm
                  [&::-moz-range-track]:h-0.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent
                  [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3
                  [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0
                  [&::-moz-range-thumb]:bg-foreground [&::-moz-range-thumb]:shadow-sm
                "
                style={{
                  /* Gradient on the full input h-8 looked like a fat pill; paint only a 2px strip (matches track). */
                  background:
                    duration > 0
                      ? `linear-gradient(to right, var(--foreground) ${(currentTime / duration) * 100}%, var(--border) ${(currentTime / duration) * 100}%) center / 100% 2px no-repeat`
                      : `linear-gradient(var(--border), var(--border)) center / 100% 2px no-repeat`,
                }}
              />
            )}
          </div>

          {/* Duration */}
          <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
            {duration > 0 ? formatTime(duration) : "—"}
          </span>

          {/* Mute */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full"
            onClick={toggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
