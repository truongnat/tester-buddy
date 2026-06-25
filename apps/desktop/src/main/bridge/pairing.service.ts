import { randomBytes } from "crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { app } from "electron";

export class PairingService {
  private token: string;

  constructor() {
    this.token = this.loadOrCreate();
  }

  private loadOrCreate(): string {
    const dir = app.getPath("userData");
    const file = join(dir, "pairing-token.txt");
    if (existsSync(file)) {
      return readFileSync(file, "utf-8").trim();
    }
    const token = randomBytes(32).toString("hex");
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, token, "utf-8");
    return token;
  }

  getToken() {
    return this.token;
  }

  validate(input: string) {
    return input === this.token;
  }
}
