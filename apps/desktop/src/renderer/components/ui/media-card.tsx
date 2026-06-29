import { Film } from "lucide-react";
import { cn } from "../../lib/cn";
import { Badge } from "./badge";

type MediaCardProps = {
  filepath: string;
  kind: "screenshot" | "video";
  className?: string;
};

export function MediaCard({ filepath, kind, className }: MediaCardProps) {
  const filename = filepath.split(/[\\/]/).pop();
  return (
    <div className={cn("rounded-xl border border-border bg-bg p-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {kind === "video" && <Film size={14} className="text-primary shrink-0" />}
          <p className="truncate text-sm font-medium text-text">{filename}</p>
        </div>
        <Badge variant={kind === "video" ? "warning" : "default"}>{kind}</Badge>
      </div>
      <p className="mt-1 truncate text-2xs text-text-muted">{filepath}</p>
    </div>
  );
}
