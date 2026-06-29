import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";

interface SelectItemProps {
  value: string;
  children: React.ReactNode;
}

export function SelectItem({ children }: SelectItemProps) {
  return <>{children}</>;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  prefix?: React.ReactNode;
  children?: React.ReactNode;
}

export function Select({ value, onChange, placeholder, className, prefix, children }: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const items = React.useMemo(() => {
    const result: { value: string; label: React.ReactNode }[] = [];
    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child) && child.props.value !== undefined) {
        result.push({ value: child.props.value, label: child.props.children });
      }
    });
    return result;
  }, [children]);

  const selected = items.find((item) => item.value === value);
  const selectedLabel = selected?.label ?? placeholder ?? "Select...";

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (
      ref.current && !ref.current.contains(e.target as Node) &&
      dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
    ) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, handleClickOutside]);

  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      if (dropdownRef.current) {
        dropdownRef.current.style.top = `${rect.bottom + 4}px`;
        dropdownRef.current.style.left = `${rect.left}px`;
        dropdownRef.current.style.width = `${rect.width}px`;
      }
    }
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-10 w-full cursor-pointer items-center gap-1.5 rounded border border-border bg-surface px-2.5 text-sm text-text hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-primary"
      >
        {prefix && <span className="shrink-0">{prefix}</span>}
        <span className={cn("flex-1 truncate text-left", !selected && "text-text-muted")}>
          {selectedLabel}
        </span>
        <ChevronDown size={14} className={cn("shrink-0 text-text-muted transition", open && "rotate-180")} />
      </button>

      {open && (
        <div
          ref={dropdownRef}
          className="fixed z-[9999] overflow-hidden rounded border border-border bg-surface shadow-lg"
        >
          {items.length === 0 ? (
            <div className="px-2.5 py-1.5 text-sm text-text-muted">No options</div>
          ) : (
            items.map((item) => {
              const isActive = item.value === value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onMouseDown={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-surface-muted",
                    isActive ? "bg-primary/10 text-primary font-medium" : "text-text"
                  )}
                >
                  {item.label}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
