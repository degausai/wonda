import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getCliVersionPolicy } from "../version-policy.js";
import {
  buildUpdateInstruction,
  captureBinaryVersion,
  compareVersions,
  detectInstallChannel,
  formatVersion,
} from "../version.js";

const RELEASE_DOWNLOAD_BASE =
  "https://github.com/degausai/wonda/releases/download";
const UPDATE_PAGE_URL = "https://wonda.sh/update";

const execFileAsync = promisify(execFile);

/**
 * Local mode only. Claude Desktop never updates an extension installed from a
 * file, and its bundled binary cannot self-update, so this is how "update
 * Wonda" works from a chat: download the release's extension, check it against
 * the release checksums, and open it. Claude Desktop then shows its own install
 * window, and the user's click on Install is the consent.
 */
export function registerUpdateTools(server: McpServer): void {
  server.registerTool(
    "wonda_update",
    {
      title: "Update Wonda",
      description:
        "Update Wonda to the latest version. Call it when the user asks to update Wonda, or offer it when a tool result says Wonda is outdated. In the Claude Desktop extension it downloads the latest extension and opens it, so Claude shows an install window: tell the user to click Install. Any other install gets the command to run.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return {
          content: [{ type: "text" as const, text: await updateWonda() }],
        };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: `The update did not finish (${reason}). The user can update with one click at ${UPDATE_PAGE_URL}.`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

async function updateWonda(): Promise<string> {
  const [current, policy] = await Promise.all([
    captureBinaryVersion(),
    getCliVersionPolicy(),
  ]);
  const latest = policy?.latest;
  if (latest === undefined) {
    throw new Error("could not check the latest version");
  }
  if (current !== undefined && compareVersions(current, latest) >= 0) {
    return `Wonda is up to date (${formatVersion(current)}).`;
  }
  const channel = detectInstallChannel();
  if (channel !== "mcpb") {
    const instruction = buildUpdateInstruction(channel, policy);
    return `Wonda ${formatVersion(latest)} is available. ${instruction ?? `Update at ${UPDATE_PAGE_URL}.`}`;
  }
  const file = await downloadExtension(latest);
  await execFileAsync("open", [file]);
  return `Claude is now showing the Wonda ${formatVersion(latest)} install window. Tell the user to click Install there; Wonda restarts on the new version. If the window does not appear, they can open "${file}" or go to ${UPDATE_PAGE_URL}.`;
}

async function downloadExtension(version: string): Promise<string> {
  const asset = `wonda-darwin-${process.arch === "arm64" ? "arm64" : "amd64"}.mcpb`;
  const releaseBase = `${RELEASE_DOWNLOAD_BASE}/v${version.replace(/^v/, "")}`;
  const [bundle, checksums] = await Promise.all([
    fetchOk(`${releaseBase}/${asset}`).then((response) =>
      response.arrayBuffer(),
    ),
    fetchOk(`${releaseBase}/checksums.txt`).then((response) => response.text()),
  ]);
  const bytes = Buffer.from(bundle);
  const expected = checksums
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .find((parts) => parts[1] === asset)?.[0];
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (expected !== actual) {
    throw new Error("the download did not match the release checksum");
  }
  const file = join(
    homedir(),
    "Downloads",
    `Wonda ${formatVersion(version)}.mcpb`,
  );
  await writeFile(file, bytes);
  return file;
}

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`download failed (HTTP ${response.status})`);
  }
  return response;
}
