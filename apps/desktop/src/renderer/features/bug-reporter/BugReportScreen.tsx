import { useState, useEffect } from "react";
import { Plus, Download, Trash2, Camera, Save, Check, Video } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input, Textarea } from "../../components/ui/input";

type Severity = "low" | "medium" | "high" | "critical";

interface BugReport {
  id: string;
  title: string;
  severity: Severity;
  description: string;
  stepsToReproduce: string;
  expectedResult: string;
  actualResult: string;
  screenshots: string[];
  video?: string;
  createdAt?: string;
}

const SEVERITY_CONFIG: Record<Severity, { label: string; variant: "default" | "warning" | "error" | "primary" }> = {
  low:      { label: "Low",      variant: "default" },
  medium:   { label: "Medium",   variant: "primary" },
  high:     { label: "High",     variant: "warning" },
  critical: { label: "Critical", variant: "error" },
};

const EMPTY_DRAFT = (): BugReport => ({
  id: crypto.randomUUID(),
  title: "",
  severity: "medium",
  description: "",
  stepsToReproduce: "",
  expectedResult: "",
  actualResult: "",
  screenshots: [],
  video: undefined,
});

export function BugReportScreen() {
  const [reports, setReports] = useState<BugReport[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BugReport>(EMPTY_DRAFT());
  const [isSaved, setIsSaved] = useState(false);

  // Load all reports from database
  const loadReports = async () => {
    if (window.testerbuddy?.getBugReports) {
      const all = await window.testerbuddy.getBugReports();
      setReports(all);
    }
  };

  useEffect(() => {
    loadReports();

    // Check if there are copied steps from live session
    const tempStepsStr = sessionStorage.getItem("testerbuddy:temp_steps");
    const tempScreenshotsStr = sessionStorage.getItem("testerbuddy:temp_screenshots");
    const tempVideo = sessionStorage.getItem("testerbuddy:temp_video");

    if (tempStepsStr || tempScreenshotsStr || tempVideo) {
      const newDraft = EMPTY_DRAFT();
      
      if (tempStepsStr) {
        try {
          const steps = JSON.parse(tempStepsStr) as string[];
          newDraft.stepsToReproduce = steps.map((s, idx) => `${idx + 1}. ${s}`).join("\n");
        } catch (e) {
          console.error(e);
        }
        sessionStorage.removeItem("testerbuddy:temp_steps");
      }

      if (tempScreenshotsStr) {
        try {
          const screenshots = JSON.parse(tempScreenshotsStr) as string[];
          newDraft.screenshots = screenshots;
        } catch (e) {
          console.error(e);
        }
        sessionStorage.removeItem("testerbuddy:temp_screenshots");
      }

      if (tempVideo) {
        newDraft.video = tempVideo;
        sessionStorage.removeItem("testerbuddy:temp_video");
      }

      setDraft(newDraft);
      setSelectedId(newDraft.id);
    }
  }, []);

  const set = <K extends keyof BugReport>(k: K, v: BugReport[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setIsSaved(false);
  };

  const handleSelectReport = (report: BugReport) => {
    setSelectedId(report.id);
    setDraft({ ...report });
    setIsSaved(true);
  };

  const handleCreateNew = () => {
    const newDraft = EMPTY_DRAFT();
    setSelectedId(newDraft.id);
    setDraft(newDraft);
    setIsSaved(false);
  };

  const handleSave = async () => {
    if (!draft.title.trim()) {
      alert("Please enter a bug title before saving.");
      return;
    }
    if (window.testerbuddy?.saveBugReport) {
      await window.testerbuddy.saveBugReport(draft);
      setIsSaved(true);
      await loadReports();
    }
  };

  const handleDelete = async (id: string) => {
    if (window.testerbuddy?.deleteBugReport) {
      if (confirm("Are you sure you want to delete this bug report?")) {
        await window.testerbuddy.deleteBugReport(id);
        if (selectedId === id) {
          handleCreateNew();
        }
        await loadReports();
      }
    }
  };

  const handleExport = async () => {
    if (window.testerbuddy?.exportBug) {
      const res = await window.testerbuddy.exportBug(draft);
      if (res.success) {
        alert(`Bug report exported successfully to:\n${res.filePath}`);
      }
    }
  };

  const removeScreenshot = (indexToRemove: number) => {
    set("screenshots", draft.screenshots.filter((_, idx) => idx !== indexToRemove));
  };

  return (
    <div className="flex h-full min-h-0 bg-[#F8FAFC]">
      {/* Bug list sidebar */}
      <div className="w-64 shrink-0 border-r border-border/60 bg-surface flex flex-col shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <span className="text-sm font-semibold text-text tracking-tight">Saved Reports</span>
          <Button variant="ghost" size="icon" onClick={handleCreateNew} title="New Report" className="h-8 w-8 rounded-lg">
            <Plus size={15} />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1 no-scrollbar">
          {reports.length === 0 ? (
            <div className="text-center py-8 text-xs text-text-muted">
              No saved bug reports.
            </div>
          ) : (
            reports.map((r) => {
              const isSelected = selectedId === r.id;
              const dateStr = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "";
              return (
                <div
                  key={r.id}
                  onClick={() => handleSelectReport(r)}
                  className={`group flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? "bg-primary/5 border-primary/30 shadow-2xs"
                      : "bg-surface border-border/40 hover:bg-surface-muted/50"
                  }`}
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <p className={`text-xs font-semibold truncate ${isSelected ? "text-primary" : "text-text"}`}>
                      {r.title || "Untitled Bug"}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Badge variant={SEVERITY_CONFIG[r.severity].variant}>
                        {SEVERITY_CONFIG[r.severity].label}
                      </Badge>
                      <span className="text-3xs text-text-muted">{dateStr}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(r.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 hover:text-error text-text-muted p-1 rounded transition-opacity"
                    title="Delete report"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Bug form */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        <div className="max-w-2xl mx-auto px-8 py-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/40 pb-4">
            <div>
              <h1 className="font-semibold text-base text-text tracking-tight">Bug Report Builder</h1>
              <p className="text-2xs text-text-muted mt-0.5">Build, edit, and export structured QA bug reports to Markdown.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleSave} className="h-8 rounded-lg font-semibold shadow-2xs">
                {isSaved ? (
                  <>
                    <Check size={13} className="text-success" />
                    Saved
                  </>
                ) : (
                  <>
                    <Save size={13} />
                    Save Draft
                  </>
                )}
              </Button>
              <Button size="sm" onClick={handleExport} className="h-8 rounded-lg font-semibold shadow-sm">
                <Download size={13} />
                Export MD
              </Button>
            </div>
          </div>

          {/* Title + severity */}
          <div className="space-y-3 bg-surface border border-border/50 rounded-xl p-5 shadow-2xs">
            <div className="space-y-1">
              <label className="text-3xs font-bold text-text-muted uppercase tracking-wider">Bug Title</label>
              <Input
                placeholder="e.g. Authentication failure on profile edit action"
                value={draft.title}
                onChange={(e) => set("title", e.target.value)}
                className="text-sm font-semibold h-9 rounded-lg focus:ring-primary/40 focus:border-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-3xs font-bold text-text-muted uppercase tracking-wider block">Severity</label>
              <div className="flex gap-2">
                {(Object.keys(SEVERITY_CONFIG) as Severity[]).map((s) => {
                  const active = draft.severity === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => set("severity", s)}
                      className={`px-3 py-1 rounded-full text-2xs font-semibold border transition-all duration-200 ${
                        active
                          ? "bg-primary/10 border-primary/30 text-primary font-bold shadow-2xs"
                          : "bg-surface border-border/80 text-text-muted hover:bg-surface-muted"
                      }`}
                    >
                      {SEVERITY_CONFIG[s].label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="bg-surface border border-border/50 rounded-xl p-5 shadow-2xs">
            <Field label="Description / Context">
              <Textarea
                rows={3}
                placeholder="Explain the background context, user impact, or general environment information..."
                value={draft.description}
                onChange={(e) => set("description", e.target.value)}
                className="text-xs rounded-lg no-scrollbar focus:ring-primary/40 focus:border-primary"
              />
            </Field>
          </div>

          {/* Steps */}
          <div className="bg-surface border border-border/50 rounded-xl p-5 shadow-2xs">
            <Field label="Steps to Reproduce">
              <Textarea
                rows={5}
                placeholder={"1. Open login page\n2. Enter correct credentials and press Enter\n3. Click on profile settings icon\n4. Witness visual crash"}
                value={draft.stepsToReproduce}
                onChange={(e) => set("stepsToReproduce", e.target.value)}
                className="text-xs font-mono rounded-lg no-scrollbar focus:ring-primary/40 focus:border-primary leading-relaxed"
              />
            </Field>
          </div>

          {/* Expected vs Actual */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-surface border border-border/50 rounded-xl p-5 shadow-2xs">
              <Field label="Expected Result">
                <Textarea
                  rows={4}
                  placeholder="What is the expected correct behavior..."
                  value={draft.expectedResult}
                  onChange={(e) => set("expectedResult", e.target.value)}
                  className="text-xs rounded-lg no-scrollbar focus:ring-primary/40 focus:border-primary"
                />
              </Field>
            </div>
            <div className="bg-surface border border-border/50 rounded-xl p-5 shadow-2xs">
              <Field label="Actual Result">
                <Textarea
                  rows={4}
                  placeholder="What actually happens under error circumstances..."
                  value={draft.actualResult}
                  onChange={(e) => set("actualResult", e.target.value)}
                  className="text-xs rounded-lg no-scrollbar focus:ring-primary/40 focus:border-primary"
                />
              </Field>
            </div>
          </div>

          {/* Screenshots */}
          <div className="bg-surface border border-border/50 rounded-xl p-5 shadow-2xs">
            <label className="text-3xs font-bold text-text-muted uppercase tracking-wider block mb-2">Attached Screenshots</label>
            {draft.screenshots.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-6 border border-dashed border-border/80 rounded-lg bg-surface-muted/30">
                <Camera size={20} className="text-text-muted/40 mb-1" />
                <span className="text-2xs text-text-muted">No screenshots attached yet.</span>
                <span className="text-3xs text-text-muted/70 mt-0.5">Select screenshot events in the Live Session timeline to attach them.</span>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {draft.screenshots.map((s, idx) => (
                  <div key={idx} className="relative group border border-border/80 rounded-lg overflow-hidden bg-bg aspect-video shadow-2xs">
                    <img src={s} alt={`Attached ${idx}`} className="w-full h-full object-contain" />
                    <button
                      type="button"
                      onClick={() => removeScreenshot(idx)}
                      className="absolute top-1.5 right-1.5 bg-black/60 hover:bg-error text-white p-1 rounded-md transition-colors"
                      title="Remove screenshot"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Video Attachment */}
          {draft.video && (
            <div className="bg-surface border border-border/50 rounded-xl p-5 shadow-2xs">
              <label className="text-3xs font-bold text-text-muted uppercase tracking-wider block mb-2">Attached Session Video</label>
              <div className="flex items-center justify-between p-3 border border-border/80 rounded-lg bg-primary/5">
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <span className="p-2 rounded bg-primary/10 text-primary shrink-0">
                    <Video size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-text truncate">
                      {draft.video.split(/[\\/]/).pop()}
                    </p>
                    <p className="text-3xs font-mono text-text-muted truncate mt-0.5">
                      {draft.video}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => set("video", undefined)}
                  className="hover:text-error text-text-muted p-1.5 rounded transition-colors"
                  title="Remove video attachment"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-3xs font-bold text-text-muted uppercase tracking-wider block">{label}</label>
      {children}
    </div>
  );
}
