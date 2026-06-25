import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

const badge = cva(
  "inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-surface-muted text-text",
        primary: "bg-primary/10 text-primary",
        error: "bg-error/10 text-error",
        success: "bg-success/10 text-success",
        warning: "bg-warning/10 text-warning",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ variant }), className)} {...props} />;
}
