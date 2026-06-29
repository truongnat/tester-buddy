import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

type SectionProps = {
  title?: string;
  description?: string;
  badge?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Section({ title, description, badge, action, children, className }: SectionProps) {
  const header = title || description || badge || action;
  return (
    <div className={cn("rounded-2xl border border-border bg-surface p-5 shadow-sm", className)}>
      {header && (
        <div className="flex items-center justify-between gap-3">
          <div>
            {title && <h2 className="text-sm font-semibold text-text">{title}</h2>}
            {description && <p className="text-2xs text-text-muted">{description}</p>}
          </div>
          {(badge || action) && (
            <div className="flex items-center gap-2 shrink-0">
              {badge}
              {action}
            </div>
          )}
        </div>
      )}
      <div className={header ? "mt-3" : undefined}>{children}</div>
    </div>
  );
}
