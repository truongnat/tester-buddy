import { spawn } from "child_process";
import { unlinkSync } from "fs";
import { getFfmpegPath, log as logFfmpeg } from "./ffmpeg";

const FFMPEG_TIMEOUT_MS = 10 * 60 * 1000;

export function convertToMp4(
  webmPath: string,
  mp4Path: string,
  estimatedDurationSec?: number,
  onProgress?: (percent: number) => void
): Promise<string> {
  return new Promise((resolve) => {
    const ffmpegPath = getFfmpegPath();
    let totalDurationSec = estimatedDurationSec || 0;
    const startTime = Date.now();
    let settled = false;

    console.log(`[ffmpeg] Starting conversion of ${webmPath} to ${mp4Path}...`);
    logFfmpeg(`Starting conversion of ${webmPath} to ${mp4Path} with estimated duration: ${estimatedDurationSec}`);

    const ffmpeg = spawn(ffmpegPath, [
      "-y",
      "-i", webmPath,
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-pix_fmt", "yuv420p",
      mp4Path
    ], { stdio: ["ignore", "ignore", "pipe"] });

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        ffmpeg.kill("SIGKILL");
        console.error(`[ffmpeg] Timed out after ${FFMPEG_TIMEOUT_MS}ms, killed process`);
        logFfmpeg(`Timed out after ${FFMPEG_TIMEOUT_MS}ms, killed process`);
        if (onProgress) onProgress(100);
        resolve(webmPath);
      }
    }, FFMPEG_TIMEOUT_MS);

    ffmpeg.stderr.on("data", (data: Buffer) => {
      const output = data.toString();
      console.log(`[ffmpeg] ${output.trim()}`);
      logFfmpeg(`[stderr] ${output.trim()}`);

      if (!totalDurationSec) {
        const durationMatch = output.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/i);
        if (durationMatch) {
          const hours = parseInt(durationMatch[1], 10);
          const minutes = parseInt(durationMatch[2], 10);
          const seconds = parseInt(durationMatch[3], 10);
          const msStr = durationMatch[4] || "0";
          const ms = parseFloat("0." + msStr);
          totalDurationSec = hours * 3600 + minutes * 60 + seconds + ms;
          console.log(`[ffmpeg] Parsed total duration: ${totalDurationSec}s`);
          logFfmpeg(`Parsed total duration: ${totalDurationSec}s`);
        }
      }

      const timeMatch = output.match(/time=\s*(-?\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/i);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);
        const seconds = parseInt(timeMatch[3], 10);
        const msStr = timeMatch[4] || "0";
        const ms = parseFloat("0." + msStr);
        const currentSec = Math.abs(hours) * 3600 + minutes * 60 + seconds + ms;

        if (totalDurationSec > 0 && onProgress) {
          const percent = Math.min(99, Math.round((currentSec / totalDurationSec) * 100));
          onProgress(percent);
        }
      }
    });

    ffmpeg.on("close", (code: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      let finalPath = mp4Path;

      if (code !== 0) {
        console.error(`[ffmpeg] Conversion failed after ${duration}s with exit code ${code}`);
        logFfmpeg(`Conversion failed after ${duration}s with exit code ${code}`);
        finalPath = webmPath;
      } else {
        console.log(`[ffmpeg] Conversion succeeded in ${duration}s`);
        logFfmpeg(`Conversion succeeded in ${duration}s`);
        try { unlinkSync(webmPath); } catch { /* ignore */ }
      }

      if (onProgress) onProgress(100);
      resolve(finalPath);
    });

    ffmpeg.on("error", (spawnError: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      console.error(`[ffmpeg] Failed to start conversion:`, spawnError);
      logFfmpeg(`Failed to start conversion error: ${spawnError?.message || spawnError}`);
      resolve(webmPath);
    });
  });
}
