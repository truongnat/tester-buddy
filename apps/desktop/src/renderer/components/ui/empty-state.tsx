import type { ElementType } from "react";
import { cn } from "../../lib/cn";

type EmptyStateProps = {
  icon?: ElementType;
  message: string;
  className?: string;
  compact?: boolean;
};

export function EmptyState({ icon: Icon, message, className, compact }: EmptyStateProps) {
  return (
    <div className={cn(compact ? "rounded-xl border border-dashed border-border p-4 text-xs text-text-muted text-center" : "flex h-full items-center justify-center rounded-2xl border border-dashed border-border bg-surface text-text-muted gap-3", className)}>
      {Icon && <Icon size={compact ? 16 : 24} className="opacity-50" />}
      <span className={compact ? undefined : "text-sm"}>{message}</span>
    </div>
  );
}
