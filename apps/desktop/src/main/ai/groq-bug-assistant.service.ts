import { z } from "zod";

const GroqBugDraftSchema = z.object({
  title: z.string().min(1).max(180),
  severity: z.enum(["low", "medium", "high", "critical"]),
  description: z.string().min(1),
  stepsToReproduce: z.string().min(1),
  expectedResult: z.string().min(1),
  actualResult: z.string().min(1),
});

export type GroqBugDraft = z.infer<typeof GroqBugDraftSchema>;

export type GroqBugDraftInput = {
  projectName?: string;
  ticketLabel?: string;
  currentTitle?: string;
  currentDescription?: string;
  steps: Array<{
    ts: number;
    summary: string;
    eventType: string;
  }>;
};

function buildPrompt(input: GroqBugDraftInput) {
  const timeline = input.steps
    .map((step, index) => `${index + 1}. [${new Date(step.ts).toISOString()}] ${step.summary} (${step.eventType})`)
    .join("\n");

  return [
    "You are a senior QA engineer writing a concise bug report draft.",
    "Return strict JSON only with keys: title, severity, description, stepsToReproduce, expectedResult, actualResult.",
    "Use severity from: low, medium, high, critical.",
    "Do not include markdown fences.",
    "",
    `Project: ${input.projectName || "unknown"}`,
    `Ticket: ${input.ticketLabel || "unknown"}`,
    `Current title: ${input.currentTitle || ""}`,
    `Current description: ${input.currentDescription || ""}`,
    "Timeline:",
    timeline || "No steps provided.",
  ].join("\n");
}

export class GroqBugAssistantService {
  private readonly apiKey = process.env.GROQ_API_KEY?.trim();
  private readonly model = process.env.GROQ_MODEL?.trim() || "llama-3.1-8b-instant";

  isAvailable() {
    return Boolean(this.apiKey);
  }

  async generateBugDraft(input: GroqBugDraftInput): Promise<GroqBugDraft> {
    if (!this.apiKey) {
      throw new Error("GROQ_API_KEY is not configured.");
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You generate bug report drafts from QA timelines. Return valid JSON only.",
          },
          {
            role: "user",
            content: buildPrompt(input),
          },
        ],
      }),
    });

    const payload = await response.text();
    if (!response.ok) {
      throw new Error(`Groq request failed (${response.status}): ${payload.slice(0, 300)}`);
    }

    const parsed = JSON.parse(payload) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = parsed.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("Groq returned an empty response.");
    }

    const json = JSON.parse(content);
    return GroqBugDraftSchema.parse(json);
  }
}
