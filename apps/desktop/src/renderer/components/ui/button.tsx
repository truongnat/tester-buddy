import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

const button = cva(
  "inline-flex items-center justify-center gap-1.5 rounded font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-white hover:bg-primary-hover",
        outline: "border border-border bg-surface hover:bg-surface-muted text-text",
        ghost: "hover:bg-surface-muted text-text",
        destructive: "bg-error text-white hover:bg-error/90",
        soft: "bg-primary/15 text-primary hover:bg-primary/25 border border-primary/10",
      },
      size: {
        sm: "h-7 px-2.5 text-xs",
        md: "h-8 px-3 text-sm",
        lg: "h-9 px-4 text-base",
        icon: "h-7 w-7",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  }
);

export function Button({
  className,
  variant,
  size,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>) {
  return <button className={cn(button({ variant, size }), className)} {...props} />;
}
