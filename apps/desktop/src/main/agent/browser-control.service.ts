import type { BrowserCommand } from "@testerbuddy/protocol";
import type { WebSocketHub } from "../bridge/websocket-hub";

function getLatestSessionId(hub: WebSocketHub) {
  const sessions = hub.registry.getAllSessions();
  if (sessions.length === 0) return null;
  sessions.sort((a, b) => b.connectedAt.getTime() - a.connectedAt.getTime());
  return sessions[0].id;
}

export class BrowserControlService {
  constructor(private hub: WebSocketHub) {}

  sendToLatestSession(command: BrowserCommand) {
    const sessionId = getLatestSessionId(this.hub);
    if (!sessionId) {
      return { success: false, reason: "No active extension session" as const };
    }
    this.hub.send(sessionId, command);
    return { success: true as const, sessionId };
  }

  sendSequenceToLatestSession(commands: BrowserCommand[]) {
    const sessionId = getLatestSessionId(this.hub);
    if (!sessionId) {
      return { success: false, reason: "No active extension session" as const };
    }

    for (const command of commands) {
      this.hub.send(sessionId, command);
    }

    return { success: true as const, sessionId, commandCount: commands.length };
  }
}
