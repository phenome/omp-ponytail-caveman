import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CONFIG_FILE_NAME = "ponytail-caveman.json";
const PONYTAIL_SESSION_ENTRY_TYPE = "ponytail-mode";
const CAVEMAN_SESSION_ENTRY_TYPE = "caveman-mode";
const PONYTAIL_MODES = new Set(["lite", "full", "ultra"]);
const CAVEMAN_MODES = new Set(["lite", "full", "ultra", "wenyan-lite", "wenyan-full", "wenyan-ultra"]);
const DEFAULT_STATE = {
  ponytail: { enabled: true, mode: "full" },
  caveman: { enabled: true, mode: "ultra" },
};
const SKILL_INSTALLS = [
  ["add", "DietrichGebert/ponytail", "-g", "--skill", "*", "-y"],
  ["add", "https://github.com/juliusbrussee/caveman", "-g", "--skill", "caveman", "-y"],
];
const IS_WINDOWS = process.platform === "win32";

function normalizePonytailMode(mode) {
  if (typeof mode !== "string") return null;
  const normalized = mode.trim().toLowerCase();
  return PONYTAIL_MODES.has(normalized) ? normalized : null;
}

function normalizeCavemanMode(mode) {
  if (typeof mode !== "string") return null;
  const normalized = mode.trim().toLowerCase();
  return CAVEMAN_MODES.has(normalized) ? normalized : null;
}

function normalizeBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function activeAgentDir(env = process.env) {
  if (env.PI_CODING_AGENT_DIR) return env.PI_CODING_AGENT_DIR;

  const profile = env.OMP_PROFILE || env.PI_PROFILE;
  if (profile) return path.join(os.homedir(), ".omp", "profiles", profile, "agent");

  return path.join(os.homedir(), ".omp", "agent");
}

function findGitRoot(cwd = process.cwd()) {
  let dir = path.resolve(cwd || process.cwd());

  for (;;) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;

    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function repoConfigPath(cwd = process.cwd()) {
  return path.join(findGitRoot(cwd) || path.resolve(cwd || process.cwd()), ".omp", CONFIG_FILE_NAME);
}

function globalConfigPath(agentDir = activeAgentDir()) {
  return path.join(agentDir, CONFIG_FILE_NAME);
}

function readJsonConfig(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return { config: {}, exists: false, warning: null };

  try {
    const config = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      return { config: {}, exists: true, warning: `Invalid ${CONFIG_FILE_NAME}: ${filePath}` };
    }

    return { config, exists: true, warning: null };
  } catch {
    return { config: {}, exists: true, warning: `Invalid ${CONFIG_FILE_NAME}: ${filePath}` };
  }
}

function normalizeToolPatch(tool, config = {}) {
  const normalizeMode = tool === "caveman" ? normalizeCavemanMode : normalizePonytailMode;
  const patch = {};
  const enabled = normalizeBoolean(config?.enabled);
  const mode = normalizeMode(config?.mode);

  if (enabled !== null) patch.enabled = enabled;
  if (mode) patch.mode = mode;
  return patch;
}

function hasPatch(patch) {
  return Object.prototype.hasOwnProperty.call(patch, "enabled") || Object.prototype.hasOwnProperty.call(patch, "mode");
}

function readScopeState(scope, filePath) {
  const { config, exists, warning } = readJsonConfig(filePath);
  const state = {
    ponytail: normalizeToolPatch("ponytail", config.ponytail),
    caveman: normalizeToolPatch("caveman", config.caveman),
  };

  return { scope, path: filePath, exists, state, warning };
}

function mergeState(base, patch) {
  return {
    ponytail: { ...base.ponytail, ...patch.ponytail },
    caveman: { ...base.caveman, ...patch.caveman },
  };
}

export function resolveDefaultConfig({ cwd = process.cwd(), agentDir, env = process.env } = {}) {
  const global = readScopeState("global", globalConfigPath(agentDir || activeAgentDir(env)));
  const repo = readScopeState("repo", repoConfigPath(cwd));
  const scopes = { global, repo };
  const warnings = [global.warning, repo.warning].filter(Boolean);
  const sources = [global, repo].filter((scope) => scope.exists && !scope.warning).map((scope) => scope.path);
  const effective = [global, repo].reduce((state, scope) => (scope.warning ? state : mergeState(state, scope.state)), DEFAULT_STATE);

  const { ponytail, caveman } = effective;
  return {
    ponytail,
    caveman,
    effective,
    scopes,
    sources,
    warnings,
    ponytailDefaultMode: ponytail.mode,
    ponytailEnabled: ponytail.enabled,
    cavemanEnabled: caveman.enabled,
    cavemanMode: caveman.mode,
  };
}

export const resolveConfiguredState = resolveDefaultConfig;

function readExistingConfig(filePath) {
  const { config } = readJsonConfig(filePath);
  return config && typeof config === "object" && !Array.isArray(config) ? config : {};
}

function writeConfigPatch(filePath, patch) {
  const current = readExistingConfig(filePath);
  const merged = { ...current };

  if (patch.ponytail) merged.ponytail = { ...(current.ponytail || {}), ...patch.ponytail };
  if (patch.caveman) merged.caveman = { ...(current.caveman || {}), ...patch.caveman };

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(merged, null, 2)}\n`);
  return merged;
}

function writeScopedConfig(scope, patch, ctx) {
  const filePath = scope === "repo"
    ? repoConfigPath(ctx?.cwd)
    : globalConfigPath(activeAgentDir());
  writeConfigPatch(filePath, patch);
  return filePath;
}

export function writeDefaultCavemanMode(mode) {
  const normalizedMode = normalizeCavemanMode(mode);
  if (!normalizedMode) return null;
  writeConfigPatch(globalConfigPath(), { caveman: { mode: normalizedMode } });
  return normalizedMode;
}

function splitArgs(text) {
  return String(text || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function parseToolCommand(text, tool) {
  const args = splitArgs(text);
  const modes = tool === "caveman" ? CAVEMAN_MODES : PONYTAIL_MODES;

  if (args.length === 0 || (args.length === 1 && ["status", "help"].includes(args[0]))) return { type: "status" };
  if (args.length === 1 && args[0] === "install-skills") return { type: "install-skills" };
  if (args.length === 1 && args[0] === "on") return { type: "set-session", data: { enabled: true } };
  if (args.length === 1 && args[0] === "off") return { type: "set-session", data: { enabled: false } };
  if (args.length === 1 && modes.has(args[0])) return { type: "set-session", data: { enabled: true, mode: args[0] } };

  if (args.length === 2 && ["global", "repo"].includes(args[0])) {
    if (args[1] === "on") return { type: "set-scope", scope: args[0], data: { enabled: true } };
    if (args[1] === "off") return { type: "set-scope", scope: args[0], data: { enabled: false } };
    if (modes.has(args[1])) return { type: "set-scope", scope: args[0], data: { enabled: true, mode: args[1] } };
  }

  return { type: "unknown" };
}

export function parsePonytailCommand(text) {
  return parseToolCommand(text, "ponytail");
}

export function parseCavemanCommand(text) {
  return parseToolCommand(text, "caveman");
}

function resolveSessionToolState(entries, customType, fallback, normalizeMode) {
  const state = { ...fallback };
  const list = Array.isArray(entries) ? entries : [];

  for (const entry of list) {
    if (entry?.customType !== customType || (entry.type !== undefined && entry.type !== "custom")) continue;

    const enabled = normalizeBoolean(entry.data?.enabled);
    const mode = normalizeMode(entry.data?.mode);
    if (enabled !== null) state.enabled = enabled;
    if (mode) state.mode = mode;
  }

  return state;
}

export function resolveSessionMode(entries, fallbackMode = DEFAULT_STATE.ponytail.mode) {
  return resolveSessionToolState(entries, PONYTAIL_SESSION_ENTRY_TYPE, { enabled: true, mode: fallbackMode }, normalizePonytailMode).mode;
}

export function resolveCavemanEnabled(entries, fallbackEnabled = DEFAULT_STATE.caveman.enabled) {
  return resolveSessionToolState(entries, CAVEMAN_SESSION_ENTRY_TYPE, { enabled: fallbackEnabled, mode: DEFAULT_STATE.caveman.mode }, normalizeCavemanMode).enabled;
}

export function resolveCavemanMode(entries, fallbackMode = DEFAULT_STATE.caveman.mode) {
  return resolveSessionToolState(entries, CAVEMAN_SESSION_ENTRY_TYPE, { enabled: true, mode: fallbackMode }, normalizeCavemanMode).mode;
}

export function resolveRuntimeState(entries, config = resolveDefaultConfig()) {
  const fallback = config.effective || config;
  return {
    ponytail: resolveSessionToolState(entries, PONYTAIL_SESSION_ENTRY_TYPE, fallback.ponytail, normalizePonytailMode),
    caveman: resolveSessionToolState(entries, CAVEMAN_SESSION_ENTRY_TYPE, fallback.caveman, normalizeCavemanMode),
  };
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
  return filterSkillBody(body, mode, normalizePonytailMode, DEFAULT_STATE.ponytail.mode, /stop ponytail|normal mode/i);
}

function filterCavemanBodyForMode(body, mode) {
  return filterSkillBody(body, mode, normalizeCavemanMode, DEFAULT_STATE.caveman.mode, /stop caveman|normal mode/i);
}

function skillPaths(name, { skillsDir, agentDir, homeDir = os.homedir(), env = process.env } = {}) {
  if (skillsDir) return [path.join(skillsDir, name, "SKILL.md")];

  const piAgentDir = agentDir || activeAgentDir(env);
  return [
    path.join(piAgentDir, "skills", name, "SKILL.md"),
    path.join(homeDir, ".agents", "skills", name, "SKILL.md"),
  ];
}

const skillBodyCache = new Map();
let skillStatusCache = null;

function refreshSkillStatus() {
  skillBodyCache.clear();
  skillStatusCache = resolveSkillStatus();
  return skillStatusCache;
}

function readFirstSkill(name) {
  if (skillBodyCache.has(name)) return skillBodyCache.get(name);

  for (const skillPath of skillPaths(name)) {
    try {
      const body = fs.readFileSync(skillPath, "utf8");
      skillBodyCache.set(name, body);
      return body;
    } catch {
      // Try next supported skill location.
    }
  }

  skillBodyCache.set(name, null);
  return null;
}

export function resolveSkillStatus(options = {}) {
  const result = {};
  const missing = [];

  for (const name of ["ponytail", "caveman"]) {
    const paths = skillPaths(name, options);
    const found = paths.find((skillPath) => fs.existsSync(skillPath));
    result[name] = { missing: !found, path: found || paths[0] };
    if (!found) missing.push(name);
  }

  return { ...result, missing };
}

function skillMissing(name) {
  return skillStatusCache ? Boolean(skillStatusCache[name]?.missing) : !readFirstSkill(name);
}

export function getPonytailInstructions(mode) {
  const body = readFirstSkill("ponytail");
  if (!body) return "";

  const effectiveMode = normalizePonytailMode(mode) || DEFAULT_STATE.ponytail.mode;
  return `PONYTAIL MODE ACTIVE — level: ${effectiveMode}\n\n${filterSkillBodyForMode(body, effectiveMode)}`;
}

export function getCavemanInstructions(mode = DEFAULT_STATE.caveman.mode) {
  const body = readFirstSkill("caveman");
  if (!body) return "";

  const effectiveMode = normalizeCavemanMode(mode) || DEFAULT_STATE.caveman.mode;
  return `CAVEMAN MODE ACTIVE — level: ${effectiveMode}\n\n${filterCavemanBodyForMode(body, effectiveMode)}`;
}

function buildBeforeAgentStartContent(state) {
  const chunks = [];
  if (state.caveman.enabled) {
    const instructions = getCavemanInstructions(state.caveman.mode);
    if (instructions) chunks.push(instructions);
  }
  if (state.ponytail.enabled) {
    const instructions = getPonytailInstructions(state.ponytail.mode);
    if (instructions) chunks.push(instructions);
  }
  return chunks.join("\n\n---\n\n");
}

function notify(ctx, message, severity = "info") {
  const notifier = ctx?.ui?.notify;
  if (typeof notifier !== "function") return;
  notifier(message, severity);
}

function updateStatusWidget(ctx, state) {
  if (!ctx?.hasUI || typeof ctx.ui?.setWidget !== "function") return;

  const parts = [];
  if (state.ponytail.enabled) parts.push(`Ponytail ${state.ponytail.mode}${skillMissing("ponytail") ? " (missing skill)" : ""}`);
  if (state.caveman.enabled) parts.push(`Caveman ${state.caveman.mode}${skillMissing("caveman") ? " (missing skill)" : ""}`);

  ctx.ui.setWidget(
    "ponytail-caveman",
    parts.length ? () => ({ render() { return [parts.join(" • ")]; } }) : undefined,
  );
}

function stateLabel(state) {
  return state.enabled ? state.mode : "off";
}

function scopeLabel(scope, tool) {
  if (scope.warning) return "invalid";
  if (!scope.exists) return "unset";

  const patch = scope.state[tool];
  if (!hasPatch(patch)) return "unset";

  const parts = [];
  if (Object.prototype.hasOwnProperty.call(patch, "enabled")) parts.push(patch.enabled ? "on" : "off");
  if (patch.mode) parts.push(patch.mode);
  return parts.join(" ");
}

function toolLabel(tool) {
  return tool === "caveman" ? "Caveman" : "Ponytail";
}

function statusMessage(tool, state, resolved) {
  const missing = state[tool].enabled && skillMissing(tool) ? " • missing skill" : "";
  return `${toolLabel(tool)}: current ${stateLabel(state[tool])}${missing} • effective ${stateLabel(resolved[tool] || resolved.effective[tool])} • global ${scopeLabel(resolved.scopes.global, tool)} • repo ${scopeLabel(resolved.scopes.repo, tool)}`;
}

function applySessionPatch(pi, state, tool, patch) {
  const customType = tool === "caveman" ? CAVEMAN_SESSION_ENTRY_TYPE : PONYTAIL_SESSION_ENTRY_TYPE;
  pi.appendEntry(customType, patch);
  state[tool] = { ...state[tool], ...patch };
}

function commandValues(tool) {
  return ["status", "help", "on", "off", ...(tool === "caveman" ? CAVEMAN_MODES : PONYTAIL_MODES), "global", "repo", "install-skills"];
}

function scopedCommandValues(tool) {
  return ["on", "off", ...(tool === "caveman" ? CAVEMAN_MODES : PONYTAIL_MODES)];
}

function completions(tool, argumentPrefix = "") {
  const prefix = String(argumentPrefix || "").trimStart().toLowerCase();
  const [first, rest = ""] = prefix.split(/\s+/, 2);
  const scoped = ["global", "repo"].includes(first);
  const values = scoped ? scopedCommandValues(tool) : commandValues(tool);
  const activePrefix = scoped ? rest : first;
  return values
    .filter((value) => value.startsWith(activePrefix))
    .map((value) => ({ label: value, value: scoped ? `${first} ${value}` : value }));
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: IS_WINDOWS, stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed with exit ${code}`));
    });
  });
}

async function installSkillsWith(command, prefix) {
  for (const args of SKILL_INSTALLS) await run(command, [...prefix, ...args]);
}

async function installSkills() {
  try {
    await installSkillsWith("bunx", ["skills"]);
    return "bunx";
  } catch (bunxError) {
    try {
      await installSkillsWith("npx", ["-y", "skills"]);
      return "npx -y";
    } catch (npxError) {
      throw new Error(`${bunxError.message}; ${npxError.message}`);
    }
  }
}

export default function ponytailCavemanExtension(pi) {
  let resolved = resolveDefaultConfig();
  let state = { ponytail: { ...resolved.ponytail }, caveman: { ...resolved.caveman } };

  function refreshConfig(ctx) {
    resolved = resolveDefaultConfig({ cwd: ctx?.cwd });
    for (const warning of resolved.warnings) notify(ctx, warning, "warning");
    return resolved;
  }

  function refreshStateFromSession(ctx) {
    const entries = ctx?.sessionManager?.getBranch?.() ?? ctx?.sessionManager?.getEntries?.() ?? [];
    state = resolveRuntimeState(entries, resolved);
    return state;
  }

  async function maybeRefreshEnabledSkill(ctx, tool) {
    if (!state[tool].enabled) return;
    refreshSkillStatus();
    if (skillMissing(tool)) notify(ctx, `${tool} skill missing; instructions omitted until /${tool} install-skills succeeds.`, "warning");
  }

  async function handleCommand(tool, args, ctx) {
    const parsed = parseToolCommand(args, tool);

    if (parsed.type === "status") {
      notify(ctx, statusMessage(tool, state, resolved));
      return;
    }

    if (parsed.type === "install-skills") {
      try {
        const runner = await installSkills();
        refreshSkillStatus();
        notify(ctx, `Ponytail/Caveman skills refreshed via ${runner}.`);
      } catch (error) {
        refreshSkillStatus();
        notify(ctx, `Skill install failed: ${error.message}`, "warning");
      }
      updateStatusWidget(ctx, state);
      return;
    }

    if (parsed.type === "set-scope") {
      const patch = { [tool]: parsed.data };
      const filePath = writeScopedConfig(parsed.scope, patch, ctx);
      applySessionPatch(pi, state, tool, parsed.data);
      refreshConfig(ctx);
      await maybeRefreshEnabledSkill(ctx, tool);
      notify(ctx, `${parsed.scope === "repo" ? "Repo" : "Global"} ${toolLabel(tool)} ${parsed.data.mode ? `mode set to ${parsed.data.mode}` : `set to ${parsed.data.enabled ? "on" : "off"}`}.`);
      updateStatusWidget(ctx, state);
      return;
    }

    if (parsed.type === "set-session") {
      applySessionPatch(pi, state, tool, parsed.data);
      await maybeRefreshEnabledSkill(ctx, tool);
      notify(ctx, parsed.data.mode ? `${toolLabel(tool)} mode set to ${parsed.data.mode}.` : `${toolLabel(tool)} ${parsed.data.enabled === false ? `${state[tool].mode} off` : stateLabel(state[tool])}.`);
      updateStatusWidget(ctx, state);
      return;
    }

    notify(ctx, `Unknown /${tool} command. Use /${tool} status, on, off, <mode>, global <value>, repo <value>, or install-skills.`, "warning");
  }

  pi.registerCommand("ponytail", {
    description: "Set or report Ponytail mode",
    getArgumentCompletions(argumentPrefix) { return completions("ponytail", argumentPrefix); },
    handler: async (args, ctx) => handleCommand("ponytail", args, ctx),
  });

  pi.registerCommand("caveman", {
    description: "Set or report Caveman mode",
    getArgumentCompletions(argumentPrefix) { return completions("caveman", argumentPrefix); },
    handler: async (args, ctx) => handleCommand("caveman", args, ctx),
  });

  pi.on("session_start", async (_event, ctx) => {
    refreshConfig(ctx);
    refreshSkillStatus();
    refreshStateFromSession(ctx);
    for (const tool of ["ponytail", "caveman"]) {
      if (state[tool].enabled && skillMissing(tool)) notify(ctx, `${tool} skill missing; instructions omitted until /${tool} install-skills succeeds.`, "warning");
    }
    updateStatusWidget(ctx, state);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    refreshConfig(ctx);
    refreshStateFromSession(ctx);
    const content = buildBeforeAgentStartContent(state);
    if (!content) return;
    const baseSystemPrompt = Array.isArray(event.systemPrompt) ? event.systemPrompt : [];
    return { systemPrompt: [...baseSystemPrompt, content] };
  });
}
