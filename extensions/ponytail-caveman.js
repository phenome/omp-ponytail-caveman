import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_MODE = "full";
const RUNTIME_MODES = new Set(["off", "lite", "full", "ultra"]);
const SESSION_ENTRY_TYPE = "ponytail-mode";
const CAVEMAN_MODE = "ultra";
const CAVEMAN_MODES = new Set(["lite", "full", "ultra", "wenyan-lite", "wenyan-full", "wenyan-ultra"]);
const CAVEMAN_SESSION_ENTRY_TYPE = "caveman-mode";


function normalizeMode(mode) {
  if (typeof mode !== "string") return null;
  const normalized = mode.trim().toLowerCase();
  return RUNTIME_MODES.has(normalized) ? normalized : null;
}

function normalizeCavemanMode(mode) {
  if (typeof mode !== "string") return null;
  const normalized = mode.trim().toLowerCase();
  return CAVEMAN_MODES.has(normalized) ? normalized : null;
}


function configPath() {
  if (process.platform === "win32") {
    const root = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(root, "ponytail", "config.json");
  }

  const root = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(root, "ponytail", "config.json");
}

function getDefaultMode() {
  const envMode = normalizeMode(process.env.PONYTAIL_DEFAULT_MODE);
  if (envMode) return envMode;

  try {
    const parsed = JSON.parse(fs.readFileSync(configPath(), "utf8"));
    const fileMode = normalizeMode(parsed?.defaultMode);
    if (fileMode) return fileMode;
  } catch {
    // Missing or invalid config falls back to the built-in default.
  }

  return DEFAULT_MODE;
}

function writeDefaultMode(mode) {
  const normalizedMode = normalizeMode(mode);
  if (!normalizedMode) return null;

  const target = configPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify({ defaultMode: normalizedMode }, null, 2)}\n`);
  return normalizedMode;
}

export function parsePonytailCommand(text, defaultMode = DEFAULT_MODE) {
  const args = String(text || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (args.length === 0) {
    const configuredMode = normalizeMode(defaultMode) || DEFAULT_MODE;
    return { type: "set-mode", mode: configuredMode === "off" ? DEFAULT_MODE : configuredMode };
  }

  if (args.length === 1 && args[0] === "status") return { type: "status" };

  if (args.length === 2 && args[0] === "default") {
    const mode = normalizeMode(args[1]);
    if (mode) return { type: "set-default", mode };
  }

  if (args.length === 1 && args[0] === "default") return { type: "default-status" };

  if (args.length === 1) {
    const mode = normalizeMode(args[0]);
    if (mode) return { type: "set-mode", mode };
  }

  return { type: "unknown" };
}

export function parseCavemanCommand(text) {
  const args = String(text || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (args.length === 0 || (args.length === 1 && args[0] === "status")) return { type: "status" };
  if (args.length === 1 && args[0] === "on") return { type: "set-enabled", enabled: true };
  if (args.length === 1 && args[0] === "off") return { type: "set-enabled", enabled: false };
  return { type: "unknown" };
}

export function resolveSessionMode(entries, fallbackMode = DEFAULT_MODE) {
  const list = Array.isArray(entries) ? entries : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const entry = list[index];
    if (entry?.type !== "custom" || entry.customType !== SESSION_ENTRY_TYPE) continue;
    const mode = normalizeMode(entry.data?.mode);
    if (mode) return mode;
  }

  return normalizeMode(fallbackMode) || DEFAULT_MODE;
}

export function resolveCavemanEnabled(entries, fallbackEnabled = true) {
  const list = Array.isArray(entries) ? entries : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const entry = list[index];
    if (entry?.type !== "custom" || entry.customType !== CAVEMAN_SESSION_ENTRY_TYPE) continue;
    if (typeof entry.data?.enabled === "boolean") return entry.data.enabled;
  }

  return fallbackEnabled;
}

function filterSkillBody(body, mode, normalize, defaultMode, blockedLinePattern) {
  const effectiveMode = normalize(mode) || defaultMode;
  return String(body || "")
    .replace(/^---[\s\S]*?---\s*/, "")
    .split(/\r?\n/)
    .filter((line) => {
      if (blockedLinePattern.test(line)) return false;

      const tableLabel = line.match(/^\|\s*\*\*(.+?)\*\*\s*\|/);
      if (tableLabel) {
        const labelMode = normalize(tableLabel[1].trim());
        if (labelMode) return labelMode === effectiveMode;
      }

      const exampleLabel = line.match(/^-\s*([^:]+):\s*/);
      if (exampleLabel) {
        const labelMode = normalize(exampleLabel[1].trim());
        if (labelMode) return labelMode === effectiveMode;
      }

      return true;
    })
    .join("\n");
}

export function filterSkillBodyForMode(body, mode) {
  return filterSkillBody(body, mode, normalizeMode, DEFAULT_MODE, /stop ponytail|normal mode/i);
}

function getFallbackInstructions(mode) {
  return "PONYTAIL MODE ACTIVE — level: " + mode + "\n\n" +
    "You are a lazy senior developer. Lazy means efficient, not careless. The best code is the code never written.\n\n" +
    "## Persistence\n\n" +
    "ACTIVE EVERY RESPONSE. No drift back to over-building. Still active if unsure. Use `/ponytail off` to stop injecting Ponytail.\\n\\n" +
    "Current level: **" + mode + "**. Switch: `/ponytail lite|full|ultra|off`.\\n\\n" +
    "## The ladder\n\n" +
    "Before any code, stop at the first rung that holds:\n" +
    "1. Does this need to be built at all? (YAGNI)\n" +
    "2. Does the standard library do this? Use it.\n" +
    "3. Does a native platform feature cover it? Use it.\n" +
    "4. Does an already-installed dependency solve it? Use it.\n" +
    "5. Can this be one line? Make it one line.\n" +
    "6. Only then: write the minimum code that works.\n\n" +
    "## Rules\n\n" +
    "No abstractions that were not requested. No avoidable dependencies. No boilerplate nobody asked for. " +
    "Deletion over addition. Boring over clever. Fewest files possible. " +
    "Ship the lazy version and question the complex request in the same response — never stall. " +
    "Between two same-size stdlib options, pick the one correct on edge cases. " +
    "Mark intentional simplifications with a `ponytail:` comment — a shortcut with a known ceiling names the ceiling and the upgrade path in the comment.\n\n" +
    "## Output\n\n" +
    "Code first. Then at most three short lines: what was skipped, when to add it. " +
    "If the explanation is longer than the code, delete the explanation. " +
    "Explanation the user explicitly asked for is not debt, give it in full.\n\n" +
    "## When NOT to be lazy\n\n" +
    "Never simplify away: input validation at trust boundaries, error handling that prevents data loss, " +
    "security measures, accessibility basics, the calibration real hardware needs (the platform is never the spec ideal), anything the user explicitly asked to keep. " +
    "Lazy code without its check is unfinished: non-trivial logic leaves ONE runnable check behind (assert-based demo/self-check or one small test file; no frameworks). Trivial one-liners need no test.\n\n" +
    "## Boundaries\n\n" +
    "Ponytail governs what you build, not how you talk. Use `/ponytail off` to revert. Level persists until changed or session end.";
}

function skillPaths(name) {
  const piAgentDir = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".omp", "agent");
  return [
    path.join(piAgentDir, "skills", name, "SKILL.md"),
    path.join(os.homedir(), ".agents", "skills", name, "SKILL.md"),
  ];
}

const skillBodyCache = new Map();

function readFirstSkill(name) {
  if (skillBodyCache.has(name)) return skillBodyCache.get(name);

  for (const skillPath of skillPaths(name)) {
    try {
      const body = fs.readFileSync(skillPath, "utf8");
      skillBodyCache.set(name, body);
      return body;
    } catch {
      // Try the next supported skill location.
    }
  }

  skillBodyCache.set(name, null);
  return null;
}


export function getPonytailInstructions(mode) {
  const effectiveMode = normalizeMode(mode) || DEFAULT_MODE;
  const body = readFirstSkill("ponytail");
  if (body) {
    return `PONYTAIL MODE ACTIVE — level: ${effectiveMode}\n\n${filterSkillBodyForMode(body, effectiveMode)}`;
  }

  return getFallbackInstructions(effectiveMode);
}

function filterCavemanBodyForMode(body, mode) {
  return filterSkillBody(body, mode, normalizeCavemanMode, CAVEMAN_MODE, /stop caveman|normal mode/i);
}

export function getCavemanInstructions(mode = CAVEMAN_MODE) {
  const effectiveMode = normalizeCavemanMode(mode) || CAVEMAN_MODE;
  const body = readFirstSkill("caveman");
  if (body) {
    return `CAVEMAN MODE ACTIVE — level: ${effectiveMode}\n\n${filterCavemanBodyForMode(body, effectiveMode)}`;
  }

  return "CAVEMAN MODE ACTIVE — level: ultra\n\nRespond ultra-terse. Drop filler, hedging, pleasantries. Keep technical terms exact. Code unchanged.";
}

function buildBeforeAgentStartContent(ponytailMode, cavemanEnabled) {
  const chunks = [];
  if (cavemanEnabled) chunks.push(getCavemanInstructions(CAVEMAN_MODE));
  if (ponytailMode && ponytailMode !== "off") chunks.push(getPonytailInstructions(ponytailMode));
  return chunks.join("\n\n---\n\n");
}


function notify(ctx, message, severity = "info") {
  const notifier = ctx?.ui?.notify;
  if (typeof notifier !== "function") return;
  notifier(message, severity);
}

export default function ponytailCavemanExtension(pi) {
  let configuredDefaultMode = getDefaultMode();
  let currentMode = configuredDefaultMode;
  let cavemanEnabled = true;
  function setCurrentMode(mode, ctx) {
    const normalizedMode = normalizeMode(mode);
    if (!normalizedMode) return false;

    currentMode = normalizedMode;
    pi.appendEntry(SESSION_ENTRY_TYPE, { mode: normalizedMode });
    notify(ctx, `Ponytail mode set to ${normalizedMode}.`);
    return true;
  }

  function setCavemanEnabled(enabled, ctx) {
    cavemanEnabled = Boolean(enabled);
    pi.appendEntry(CAVEMAN_SESSION_ENTRY_TYPE, { enabled: cavemanEnabled });
    notify(ctx, `Caveman ultra ${cavemanEnabled ? "on" : "off"}.`);
  }


  pi.registerCommand("ponytail", {
    description: "Set or report Ponytail mode",
    handler: async (args, ctx) => {
      const parsed = parsePonytailCommand(args, configuredDefaultMode);

      if (parsed.type === "status") {
        notify(ctx, `Ponytail: current ${currentMode} • default ${configuredDefaultMode}`);
        return;
      }

      if (parsed.type === "default-status") {
        notify(ctx, `Ponytail default: ${configuredDefaultMode}`);
        return;
      }

      if (parsed.type === "set-default") {
        const defaultMode = writeDefaultMode(parsed.mode);
        if (!defaultMode) {
          notify(ctx, "Unknown or unsupported /ponytail mode.", "warning");
          return;
        }

        configuredDefaultMode = defaultMode;
        notify(ctx, `Default Ponytail mode set to ${defaultMode}.`);
        return;
      }

      if (parsed.type === "set-mode") {
        setCurrentMode(parsed.mode, ctx);
        return;
      }

      notify(ctx, "Unknown or unsupported /ponytail mode.", "warning");
    },
  });

  pi.registerCommand("caveman", {
    description: "Enable or disable Caveman ultra",
    handler: async (args, ctx) => {
      const parsed = parseCavemanCommand(args);

      if (parsed.type === "status") {
        notify(ctx, `Caveman ultra: ${cavemanEnabled ? "on" : "off"}`);
        return;
      }

      if (parsed.type === "set-enabled") {
        setCavemanEnabled(parsed.enabled, ctx);
        return;
      }

      notify(ctx, "Unknown or unsupported /caveman mode. Use /caveman on or /caveman off.", "warning");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    const entries = ctx?.sessionManager?.getBranch?.() ?? ctx?.sessionManager?.getEntries?.() ?? [];
    configuredDefaultMode = getDefaultMode();
    currentMode = resolveSessionMode(entries, configuredDefaultMode);
    cavemanEnabled = resolveCavemanEnabled(entries, true);
  });


  pi.on("before_agent_start", async () => {
    const content = buildBeforeAgentStartContent(currentMode, cavemanEnabled);
    if (!content) return;
    return {
      message: {
        customType: "ponytail-caveman-instructions",
        content,
        display: false,
        details: { ponytailMode: currentMode, caveman: cavemanEnabled ? CAVEMAN_MODE : "off" },
      },
    };
  });
}
