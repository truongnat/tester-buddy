import type { BrowserCommand } from "@testerbuddy/protocol";
import { AgentCommandService } from "./agent-command.service";
import { BrowserControlService } from "./browser-control.service";

export class AgentRunnerService {
  constructor(
    private readonly commands: AgentCommandService,
    private readonly browserControl: BrowserControlService
  ) {}

  run(input: unknown) {
    const command = this.commands.normalize(input);
    if (!command) {
      return { success: false, reason: "Could not parse agent command" as const };
    }

    if (Array.isArray(command)) {
      if (command.length === 0) {
        return { success: false, reason: "Could not parse agent command" as const };
      }
      return this.browserControl.sendSequenceToLatestSession(command as BrowserCommand[]);
    }

    return this.browserControl.sendToLatestSession(command as BrowserCommand);
  }
}
