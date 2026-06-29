import { useState, useRef, useEffect, type ElementType } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";

type SelectOption = { value: string; label: string };

type IconSelectProps = {
  icon: ElementType;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
};

export function IconSelect({ icon: Icon, value, onChange, options, placeholder, className }: IconSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = options.find((o) => o.value === value);
  const display = selected?.label ?? placeholder ?? "";

  return (
    <div ref={ref} className={cn("relative cursor-pointer min-w-44", className)}>
      <div
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-2 rounded-xl border border-border bg-bg px-3 h-7"
      >
        <Icon size={14} className="text-text-muted shrink-0" />
        <span className="flex-1 text-sm text-text truncate">{display || placeholder}</span>
        <ChevronDown size={14} className="text-text-muted shrink-0" />
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-border bg-surface shadow-lg overflow-hidden">
          {placeholder && (
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className={cn("w-full px-3 py-2 text-left text-sm transition-colors hover:bg-surface-muted", value === "" ? "bg-primary/5 text-primary" : "text-text-muted")}
            >
              {placeholder}
            </button>
          )}
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={cn("w-full px-3 py-2 text-left text-sm transition-colors hover:bg-surface-muted", value === opt.value ? "bg-primary/5 text-primary font-medium" : "text-text")}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
