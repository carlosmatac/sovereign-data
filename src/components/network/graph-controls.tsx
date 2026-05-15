"use client";

import { useReactFlow } from "@xyflow/react";
import { ZoomIn, ZoomOut, Maximize2, RotateCcw } from "lucide-react";

interface GraphControlsProps {
  onReset: () => void;
}

export function GraphControls({ onReset }: GraphControlsProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-px overflow-hidden rounded-lg border border-white/10 bg-black/50 backdrop-blur-sm">
      <ControlButton title="Zoom in" onClick={() => zoomIn({ duration: 200 })}>
        <ZoomIn size={14} />
      </ControlButton>
      <ControlButton title="Zoom out" onClick={() => zoomOut({ duration: 200 })}>
        <ZoomOut size={14} />
      </ControlButton>
      <ControlButton title="Fit view" onClick={() => fitView({ duration: 300, padding: 0.15 })}>
        <Maximize2 size={14} />
      </ControlButton>
      <div className="my-px h-px bg-white/10" />
      <ControlButton title="Reset graph" onClick={onReset}>
        <RotateCcw size={14} />
      </ControlButton>
    </div>
  );
}

function ControlButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center text-white/50 transition-colors hover:bg-white/8 hover:text-white/80"
    >
      {children}
    </button>
  );
}
