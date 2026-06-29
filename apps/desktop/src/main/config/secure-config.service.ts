import { app, safeStorage } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export type SecureConfigKey = "jira-export" | "github-export";

export class SecureConfigService {
  private getPath(key: SecureConfigKey) {
    return join(app.getPath("userData"), "secure-config", `${key}.bin`);
  }

  get<T>(key: SecureConfigKey): T | null {
    const filepath = this.getPath(key);
    if (!existsSync(filepath)) return null;
    const raw = readFileSync(filepath);
    try {
      const json = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(raw)
        : raw.toString("utf-8");
      return JSON.parse(json) as T;
    } catch {
      return null;
    }
  }

  set<T>(key: SecureConfigKey, value: T) {
    const filepath = this.getPath(key);
    mkdirSync(join(app.getPath("userData"), "secure-config"), { recursive: true });
    const json = JSON.stringify(value);
    const payload = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(json)
      : Buffer.from(json, "utf-8");
    writeFileSync(filepath, payload);
    return value;
  }
}
