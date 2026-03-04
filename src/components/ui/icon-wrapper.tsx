import { cn } from "@/lib/utils";

const colorMap = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
  indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400",
  purple: "bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  primary: "bg-primary/10 text-primary",
} as const;

type IconColor = keyof typeof colorMap;

const sizeMap = {
  sm: "p-1.5 rounded-md",
  md: "p-2 rounded-lg",
  lg: "p-3 rounded-xl",
} as const;

type IconSize = keyof typeof sizeMap;

interface IconWrapperProps {
  children: React.ReactNode;
  color?: IconColor;
  size?: IconSize;
  className?: string;
}

export function IconWrapper({
  children,
  color = "primary",
  size = "md",
  className,
}: IconWrapperProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center shrink-0",
        sizeMap[size],
        colorMap[color],
        className,
      )}
    >
      {children}
    </div>
  );
}
