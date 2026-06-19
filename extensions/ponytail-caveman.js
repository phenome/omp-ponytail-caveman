import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_MODE = "full";
const RUNTIME_MODES = new Set(["off", "lite", "full", "ultra"]);
const SESSION_ENTRY_TYPE = "ponytail-mode";
const DEFAULT_CAVEMAN_MODE = "ultra";
const CAVEMAN_MODES = new Set(["lite", "full", "ultra", "wenyan-lite", "wenyan-full", "wenyan-ultra"]);
const CAVEMAN_SESSION_ENTRY_TYPE = "caveman-mode";
const CONFIG_FILE_NAME = "ponytail-caveman.json";
const DEFAULT_CAVEMAN_ENABLED = true;

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

function normalizeBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function normalizeBooleanEnv(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "on" || normalized === "1") return true;
  if (normalized === "false" || normalized === "off" || normalized === "0") return false;
  return null;
}

function activeAgentDir(env = process.env) {
  if (env.PI_CODING_AGENT_DIR) return env.PI_CODING_AGENT_DIR;

  const profile = env.OMP_PROFILE || env.PI_PROFILE;
  if (profile) return path.join(os.homedir(), ".omp", "profiles", profile, "agent");

  return path.join(os.homedir(), ".omp", "agent");
}

function findProjectConfigPath(cwd) {
  let dir = path.resolve(cwd || process.cwd());

  for (;;) {
    const candidate = path.join(dir, ".omp", CONFIG_FILE_NAME);
    if (fs.existsSync(candidate)) return candidate;

    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function readJsonConfig(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return { config: {}, warning: null };

  try {
    const config = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      return { config: {}, warning: `Invalid ${CONFIG_FILE_NAME}: ${filePath}` };
    }

    return { config, warning: null };
  } catch {
    return { config: {}, warning: `Invalid ${CONFIG_FILE_NAME}: ${filePath}` };
  }
}

function applyDefaultConfig(result, filePath, config) {
  const ponytailMode = normalizeMode(config?.ponytail?.defaultMode);
  if (ponytailMode) result.ponytailDefaultMode = ponytailMode;

  const cavemanEnabled = normalizeBoolean(config?.caveman?.enabled);
  if (cavemanEnabled !== null) result.cavemanEnabled = cavemanEnabled;
  const cavemanMode = normalizeCavemanMode(config?.caveman?.mode);
  if (cavemanMode) result.cavemanMode = cavemanMode;

  result.sources.push(filePath);
}

function configFilePaths(agentDir, cwd) {
  const paths = [path.join(agentDir, CONFIG_FILE_NAME), findProjectConfigPath(cwd)].filter(Boolean);
  return [...new Set(paths)];
}

export function resolveDefaultConfig({ cwd = process.cwd(), agentDir, env = process.env } = {}) {
  const resolvedAgentDir = agentDir || activeAgentDir(env);
  const result = {
    ponytailDefaultMode: DEFAULT_MODE,
    cavemanEnabled: DEFAULT_CAVEMAN_ENABLED,
    cavemanMode: DEFAULT_CAVEMAN_MODE,
    sources: [],
    warnings: [],
  };

  for (const filePath of configFilePaths(resolvedAgentDir, cwd)) {
    if (!fs.existsSync(filePath)) continue;

    const { config, warning } = readJsonConfig(filePath);
    if (warning) {
      result.warnings.push(warning);
      continue;
    }

    applyDefaultConfig(result, filePath, config);
  }

  const envPonytailMode = normalizeMode(env.PONYTAIL_DEFAULT_MODE);
  if (envPonytailMode) {
    result.ponytailDefaultMode = envPonytailMode;
    result.sources.push("env:PONYTAIL_DEFAULT_MODE");
  }

  const envCavemanEnabled = normalizeBooleanEnv(env.CAVEMAN_DEFAULT_ENABLED);
  if (envCavemanEnabled !== null) {
    result.cavemanEnabled = envCavemanEnabled;
    result.sources.push("env:CAVEMAN_DEFAULT_ENABLED");
  }

  const envCavemanMode = normalizeCavemanMode(env.CAVEMAN_DEFAULT_MODE);
  if (envCavemanMode) {
    result.cavemanMode = envCavemanMode;
    result.sources.push("env:CAVEMAN_DEFAULT_MODE");
  }

  return result;
}

function readExistingGlobalConfig(filePath) {
  const { config } = readJsonConfig(filePath);
  return config && typeof config === "object" && !Array.isArray(config) ? config : {};
}

function writeGlobalConfigPatch(patch, agentDir = activeAgentDir()) {
  const filePath = path.join(agentDir, CONFIG_FILE_NAME);
  const current = readExistingGlobalConfig(filePath);
  const merged = { ...current };

  if (patch.ponytail) merged.ponytail = { ...(current.ponytail || {}), ...patch.ponytail };
  if (patch.caveman) merged.caveman = { ...(current.caveman || {}), ...patch.caveman };

  fs.mkdirSync(agentDir, { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(merged, null, 2)}\n`);
  return merged;
}

function writeDefaultMode(mode) {
  const normalizedMode = normalizeMode(mode);
  if (!normalizedMode) return null;
  writeGlobalConfigPatch({ ponytail: { defaultMode: normalizedMode } });
  return normalizedMode;
}

function writeDefaultCavemanEnabled(enabled) {
  const normalizedEnabled = Boolean(enabled);
  writeGlobalConfigPatch({ caveman: { enabled: normalizedEnabled } });
  return normalizedEnabled;
}

export function writeDefaultCavemanMode(mode) {
  const normalizedMode = normalizeCavemanMode(mode);
  if (!normalizedMode) return null;
  writeGlobalConfigPatch({ caveman: { mode: normalizedMode } });
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
  if (args.length === 1 && args[0] === "default") return { type: "default-status" };
  if (args.length === 2 && args[0] === "default") {
    if (args[1] === "on") return { type: "set-default-enabled", enabled: true };
    if (args[1] === "off") return { type: "set-default-enabled", enabled: false };
    const mode = normalizeCavemanMode(args[1]);
    if (mode) return { type: "set-default-mode", mode };
  }
  if (args.length === 1) {
    const mode = normalizeCavemanMode(args[0]);
    if (mode) return { type: "set-mode", mode };
  }
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

export function resolveCavemanEnabled(entries, fallbackEnabled = DEFAULT_CAVEMAN_ENABLED) {
  const list = Array.isArray(entries) ? entries : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const entry = list[index];
    if (entry?.type !== "custom" || entry.customType !== CAVEMAN_SESSION_ENTRY_TYPE) continue;
    if (typeof entry.data?.enabled === "boolean") return entry.data.enabled;
  }

  return fallbackEnabled;
}

export function resolveCavemanMode(entries, fallbackMode = DEFAULT_CAVEMAN_MODE) {
  const list = Array.isArray(entries) ? entries : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const entry = list[index];
    if (entry?.type !== "custom" || entry.customType !== CAVEMAN_SESSION_ENTRY_TYPE) continue;
    const mode = normalizeCavemanMode(entry.data?.mode);
    if (mode) return mode;
  }

  return normalizeCavemanMode(fallbackMode) || DEFAULT_CAVEMAN_MODE;
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
  const piAgentDir = activeAgentDir();
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
  return filterSkillBody(body, mode, normalizeCavemanMode, DEFAULT_CAVEMAN_MODE, /stop caveman|normal mode/i);
}

export function getCavemanInstructions(mode = DEFAULT_CAVEMAN_MODE) {
  const effectiveMode = normalizeCavemanMode(mode) || DEFAULT_CAVEMAN_MODE;
  const body = readFirstSkill("caveman");
  if (body) {
    return `CAVEMAN MODE ACTIVE — level: ${effectiveMode}\n\n${filterCavemanBodyForMode(body, effectiveMode)}`;
  }

  return `CAVEMAN MODE ACTIVE — level: ${effectiveMode}\n\nRespond ${effectiveMode}-terse. Drop filler, hedging, pleasantries. Keep technical terms exact. Code unchanged.`;
}

function buildBeforeAgentStartContent(ponytailMode, cavemanEnabled, cavemanMode) {
  const chunks = [];
  if (cavemanEnabled) chunks.push(getCavemanInstructions(cavemanMode));
  if (ponytailMode && ponytailMode !== "off") chunks.push(getPonytailInstructions(ponytailMode));
  return chunks.join("\n\n---\n\n");
}

function notify(ctx, message, severity = "info") {
  const notifier = ctx?.ui?.notify;
  if (typeof notifier !== "function") return;
  notifier(message, severity);
}

function updateStatusWidget(ctx, ponytailMode, cavemanEnabled, cavemanMode) {
  if (!ctx?.hasUI || typeof ctx.ui?.setWidget !== "function") return;

  const parts = [];
  if (ponytailMode && ponytailMode !== "off") parts.push(`Ponytail ${ponytailMode}`);
  if (cavemanEnabled) parts.push(`Caveman ${cavemanMode}`);

  ctx.ui.setWidget(
    "ponytail-caveman",
    parts.length ? () => ({ render() { return [parts.join(" • ")]; } }) : undefined,
  );
}

export default function ponytailCavemanExtension(pi) {
  let resolvedDefaults = resolveDefaultConfig();
  let configuredDefaultMode = resolvedDefaults.ponytailDefaultMode;
  let configuredCavemanEnabled = resolvedDefaults.cavemanEnabled;
  let configuredCavemanMode = resolvedDefaults.cavemanMode;
  let currentMode = configuredDefaultMode;
  let currentCavemanMode = configuredCavemanMode;
  let cavemanEnabled = configuredCavemanEnabled;

  function setCurrentMode(mode, ctx) {
    const normalizedMode = normalizeMode(mode);
    if (!normalizedMode) return false;

    currentMode = normalizedMode;
    pi.appendEntry(SESSION_ENTRY_TYPE, { mode: normalizedMode });
    notify(ctx, `Ponytail mode set to ${normalizedMode}.`);
    updateStatusWidget(ctx, currentMode, cavemanEnabled, currentCavemanMode);
    return true;
  }

  function setCavemanEnabled(enabled, ctx) {
    cavemanEnabled = Boolean(enabled);
    pi.appendEntry(CAVEMAN_SESSION_ENTRY_TYPE, { enabled: cavemanEnabled, mode: currentCavemanMode });
    notify(ctx, `Caveman ${currentCavemanMode} ${cavemanEnabled ? "on" : "off"}.`);
    updateStatusWidget(ctx, currentMode, cavemanEnabled, currentCavemanMode);
  }

  function setCavemanMode(mode, ctx) {
    const normalizedMode = normalizeCavemanMode(mode);
    if (!normalizedMode) return false;

    currentCavemanMode = normalizedMode;
    cavemanEnabled = true;
    pi.appendEntry(CAVEMAN_SESSION_ENTRY_TYPE, { enabled: true, mode: normalizedMode });
    notify(ctx, `Caveman mode set to ${normalizedMode}.`);
    updateStatusWidget(ctx, currentMode, cavemanEnabled, currentCavemanMode);
    return true;
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
    description: "Set or report Caveman mode",
    handler: async (args, ctx) => {
      const parsed = parseCavemanCommand(args);

      if (parsed.type === "status") {
        notify(ctx, `Caveman: current ${cavemanEnabled ? currentCavemanMode : "off"} • default ${configuredCavemanMode} • default enabled ${configuredCavemanEnabled ? "on" : "off"}`);
        return;
      }

      if (parsed.type === "default-status") {
        notify(ctx, `Caveman default: ${configuredCavemanMode} • enabled ${configuredCavemanEnabled ? "on" : "off"}`);
        return;
      }

      if (parsed.type === "set-default-enabled") {
        configuredCavemanEnabled = writeDefaultCavemanEnabled(parsed.enabled);
        notify(ctx, `Default Caveman enabled set to ${configuredCavemanEnabled ? "on" : "off"}.`);
        return;
      }

      if (parsed.type === "set-default-mode") {
        configuredCavemanMode = writeDefaultCavemanMode(parsed.mode);
        if (!configuredCavemanMode) {
          notify(ctx, "Unknown or unsupported /caveman mode.", "warning");
          return;
        }

        notify(ctx, `Default Caveman mode set to ${configuredCavemanMode}.`);
        return;
      }

      if (parsed.type === "set-enabled") {
        setCavemanEnabled(parsed.enabled, ctx);
        return;
      }

      if (parsed.type === "set-mode") {
        setCavemanMode(parsed.mode, ctx);
        return;
      }

      notify(ctx, "Unknown or unsupported /caveman mode. Use /caveman on|off, /caveman <mode>, or /caveman default on|off|<mode>.", "warning");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    const entries = ctx?.sessionManager?.getBranch?.() ?? ctx?.sessionManager?.getEntries?.() ?? [];
    resolvedDefaults = resolveDefaultConfig({ cwd: ctx?.cwd });
    for (const warning of resolvedDefaults.warnings) notify(ctx, warning, "warning");
    configuredDefaultMode = resolvedDefaults.ponytailDefaultMode;
    configuredCavemanEnabled = resolvedDefaults.cavemanEnabled;
    configuredCavemanMode = resolvedDefaults.cavemanMode;
    currentMode = resolveSessionMode(entries, configuredDefaultMode);
    currentCavemanMode = resolveCavemanMode(entries, configuredCavemanMode);
    cavemanEnabled = resolveCavemanEnabled(entries, configuredCavemanEnabled);
    updateStatusWidget(ctx, currentMode, cavemanEnabled, currentCavemanMode);
  });

  pi.on("before_agent_start", async () => {
    const content = buildBeforeAgentStartContent(currentMode, cavemanEnabled, currentCavemanMode);
    if (!content) return;
    return {
      message: {
        customType: "ponytail-caveman-instructions",
        content,
        display: false,
        details: { ponytailMode: currentMode, caveman: cavemanEnabled ? currentCavemanMode : "off" },
      },
    };
  });
}
