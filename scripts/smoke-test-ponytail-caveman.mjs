#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(ROOT, 'index.js');

if (!fs.existsSync(extensionPath)) throw new Error(`Missing extension: ${extensionPath}`);

function readSkill(name) {
  const skillPath = path.join(os.homedir(), '.agents', 'skills', name, 'SKILL.md');
  if (!fs.existsSync(skillPath)) throw new Error(`Missing skill: ${skillPath}`);
  return fs.readFileSync(skillPath, 'utf8');
}

for (const name of ['ponytail-review', 'ponytail-audit', 'ponytail-debt', 'ponytail-help']) readSkill(name);

const ponytailSkill = readSkill('ponytail');
const cavemanSkill = readSkill('caveman');
const ponytailSentinel = ponytailSkill.includes('The ladder') ? 'The ladder' : 'Does this need to exist';
const cavemanSentinel = cavemanSkill.includes('Inline obj prop') ? 'Inline obj prop' : 'Drop:';
const oldAgentDir = process.env.PI_CODING_AGENT_DIR;
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ponytail-caveman-smoke-'));
const agentDir = path.join(tmpRoot, 'agent');
const agentSkillsDir = path.join(agentDir, 'skills');
const repoDir = path.join(tmpRoot, 'repo');
const subdir = path.join(repoDir, 'subdir');
const globalConfigPath = path.join(agentDir, 'ponytail-caveman.json');
const repoConfigPath = path.join(repoDir, '.omp', 'ponytail-caveman.json');

function writeConfig(filePath, config) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`);
}

function readConfig(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeSkill(skillsDir, name, body) {
  const skillDir = path.join(skillsDir, name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), body);
}

function assertConfig(actual, expected) {
  const state = actual.ponytail && actual.caveman ? actual : actual.effective;
  assert.ok(state, 'config should expose top-level state or effective state');
  assert.deepEqual(state.ponytail, expected.ponytail);
  assert.deepEqual(state.caveman, expected.caveman);
}

function assertCompletions(command, prefix, expected) {
  assert.equal(typeof command.getArgumentCompletions, 'function');
  const completions = command.getArgumentCompletions(prefix);
  assert.equal(Array.isArray(completions), true);
  for (const value of expected) assert.equal(completions.includes(value), true);
}

writeConfig(globalConfigPath, {
  ponytail: { enabled: false, mode: 'lite' },
  caveman: { enabled: false, mode: 'wenyan-full' },
});
writeConfig(repoConfigPath, {
  ponytail: { mode: 'ultra' },
  caveman: { enabled: true },
});
writeSkill(agentSkillsDir, 'ponytail', ponytailSkill);
writeSkill(agentSkillsDir, 'caveman', cavemanSkill);
fs.mkdirSync(subdir, { recursive: true });
fs.mkdirSync(path.join(repoDir, '.git'), { recursive: true });

try {
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const mod = await import(pathToFileURL(extensionPath).href);
  const { resolveDefaultConfig, parsePonytailCommand, parseCavemanCommand } = mod;
  const extension = mod.default;

  assert.equal(typeof extension, 'function');
  assert.equal(typeof resolveDefaultConfig, 'function');
  assert.equal(typeof parsePonytailCommand, 'function');
  assert.equal(typeof mod.resolveSkillStatus, 'function');
  assert.equal(typeof parseCavemanCommand, 'function');

  assertConfig(resolveDefaultConfig({ cwd: path.join(tmpRoot, 'empty-cwd'), agentDir: path.join(tmpRoot, 'empty-agent'), env: {} }), {
    ponytail: { enabled: true, mode: 'full' },
    caveman: { enabled: true, mode: 'ultra' },
  });

  assertConfig(resolveDefaultConfig({ cwd: tmpRoot, agentDir, env: {} }), {
    ponytail: { enabled: false, mode: 'lite' },
    caveman: { enabled: false, mode: 'wenyan-full' },
  });

  let cfg = resolveDefaultConfig({ cwd: subdir, agentDir, env: {} });
  assertConfig(cfg, {
    ponytail: { enabled: false, mode: 'ultra' },
    caveman: { enabled: true, mode: 'wenyan-full' },
  });
  assert.equal(cfg.sources.includes(globalConfigPath), true);
  assert.equal(cfg.sources.includes(repoConfigPath), true);


  assert.deepEqual(parsePonytailCommand(''), { type: 'status' });
  assert.deepEqual(parsePonytailCommand('help'), { type: 'status' });
  assert.deepEqual(parsePonytailCommand('status'), { type: 'status' });
  assert.deepEqual(parsePonytailCommand('on'), { type: 'set-session', data: { enabled: true } });
  assert.deepEqual(parsePonytailCommand('off'), { type: 'set-session', data: { enabled: false } });
  assert.deepEqual(parsePonytailCommand('full'), { type: 'set-session', data: { enabled: true, mode: 'full' } });
  assert.deepEqual(parsePonytailCommand('global lite'), { type: 'set-scope', scope: 'global', data: { enabled: true, mode: 'lite' } });
  assert.deepEqual(parsePonytailCommand('repo off'), { type: 'set-scope', scope: 'repo', data: { enabled: false } });
  assert.deepEqual(parsePonytailCommand('install-skills'), { type: 'install-skills' });

  assert.deepEqual(parseCavemanCommand(''), { type: 'status' });
  assert.deepEqual(parseCavemanCommand('help'), { type: 'status' });
  assert.deepEqual(parseCavemanCommand('status'), { type: 'status' });
  assert.deepEqual(parseCavemanCommand('on'), { type: 'set-session', data: { enabled: true } });
  assert.deepEqual(parseCavemanCommand('off'), { type: 'set-session', data: { enabled: false } });
  assert.deepEqual(parseCavemanCommand('wenyan-lite'), { type: 'set-session', data: { enabled: true, mode: 'wenyan-lite' } });
  assert.deepEqual(parseCavemanCommand('global ultra'), { type: 'set-scope', scope: 'global', data: { enabled: true, mode: 'ultra' } });
  assert.deepEqual(parseCavemanCommand('repo off'), { type: 'set-scope', scope: 'repo', data: { enabled: false } });
  assert.deepEqual(parseCavemanCommand('install-skills'), { type: 'install-skills' });

  assert.match(mod.getCavemanInstructions('full'), /CAVEMAN MODE ACTIVE — level: full/);
  assert.doesNotMatch(mod.getCavemanInstructions('full'), /CAVEMAN MODE ACTIVE — level: ultra/);
  assert.equal(mod.getCavemanInstructions('ultra').includes(cavemanSentinel), true);
  assert.match(mod.getPonytailInstructions('full'), /PONYTAIL MODE ACTIVE — level: full/);
  assert.equal(mod.getPonytailInstructions('full').includes(ponytailSentinel), true);
  assert.doesNotMatch(mod.getCavemanInstructions('ultra'), /stop caveman|normal mode/i);
  assert.doesNotMatch(mod.getPonytailInstructions('full'), /stop ponytail|normal mode/i);

  const missingSkillsDir = path.join(tmpRoot, 'missing-skills');
  writeSkill(missingSkillsDir, 'caveman', cavemanSkill);
  const skillStatus = mod.resolveSkillStatus({ skillsDir: missingSkillsDir, agentDir: path.join(tmpRoot, 'missing-agent') });
  assert.equal(skillStatus.ponytail.missing, true);
  assert.equal(skillStatus.caveman.missing, false);
  assert.equal(skillStatus.missing.includes('ponytail'), true);

  const events = new Map();
  const commands = new Map();
  const appended = [];
  const widgets = [];
  const notifications = [];
  extension({
    on: (name, handler) => events.set(name, handler),
    registerCommand: (name, command) => commands.set(name, command),
    appendEntry: (customType, data) => appended.push({ customType, data }),
  });

  let sessionEntries = [
    { type: 'custom', customType: 'ponytail-mode', data: { enabled: true } },
    { type: 'custom', customType: 'caveman-mode', data: { mode: 'lite' } },
  ];
  const ctx = {
    cwd: subdir,
    hasUI: true,
    ui: {
      notify: (message, severity) => notifications.push({ message, severity }),
      setWidget: (id, widgetFactory) => {
        assert.equal(widgetFactory === undefined || typeof widgetFactory === 'function', true);
        widgets.push({ id, widget: widgetFactory?.() });
      },
    },
    sessionManager: { getEntries: () => sessionEntries },
  };
  const widgetLine = () => widgets.at(-1)?.widget?.render(80).join('\n');

  assert.equal(commands.has('ponytail'), true);
  assert.equal(commands.has('caveman'), true);
  assertCompletions(commands.get('ponytail'), '', ['status', 'help', 'on', 'off', 'lite', 'full', 'ultra', 'global', 'repo', 'install-skills']);
  assertCompletions(commands.get('ponytail'), 'g', ['global']);
  assertCompletions(commands.get('ponytail'), 'repo ', ['on', 'off', 'lite', 'full', 'ultra']);
  assertCompletions(commands.get('caveman'), '', ['status', 'help', 'on', 'off', 'lite', 'full', 'ultra', 'wenyan-lite', 'wenyan-full', 'wenyan-ultra', 'global', 'repo', 'install-skills']);
  assertCompletions(commands.get('caveman'), 'w', ['wenyan-lite', 'wenyan-full', 'wenyan-ultra']);
  assertCompletions(commands.get('caveman'), 'global w', ['wenyan-lite', 'wenyan-full', 'wenyan-ultra']);

  await events.get('session_start')({}, ctx);
  assert.equal(widgets.at(-1).id, 'ponytail-caveman');
  assert.equal(widgetLine(), 'Ponytail ultra • Caveman lite');

  await commands.get('ponytail').handler('', ctx);
  assert.match(notifications.at(-1).message, /ponytail: current ultra • effective off • global off lite • repo ultra/i);
  await commands.get('caveman').handler('status', ctx);
  assert.match(notifications.at(-1).message, /caveman: current lite • effective wenyan-full • global off wenyan-full • repo on/i);

  let injected = await events.get('before_agent_start')({}, ctx);
  assert.equal(injected.message.customType, 'ponytail-caveman-instructions');
  assert.match(injected.message.content, /CAVEMAN MODE ACTIVE — level: lite/);
  assert.match(injected.message.content, /PONYTAIL MODE ACTIVE — level: ultra/);
  assert.deepEqual(injected.message.details, { ponytail: { enabled: true, mode: 'ultra' }, ponytailMode: 'ultra', caveman: 'lite' });

  await commands.get('ponytail').handler('lite', ctx);
  assert.match(notifications.at(-1).message, /Ponytail mode set to lite\./);
  assert.equal(widgetLine(), 'Ponytail lite • Caveman lite');
  assert.deepEqual(appended.at(-1), { customType: 'ponytail-mode', data: { enabled: true, mode: 'lite' } });
  injected = await events.get('before_agent_start')({}, ctx);
  assert.match(injected.message.content, /PONYTAIL MODE ACTIVE — level: lite/);
  assert.match(injected.message.content, /CAVEMAN MODE ACTIVE — level: lite/);

  await commands.get('caveman').handler('off', ctx);
  assert.match(notifications.at(-1).message, /Caveman lite off\./);
  assert.equal(widgetLine(), 'Ponytail lite');
  assert.deepEqual(appended.at(-1), { customType: 'caveman-mode', data: { enabled: false } });
  injected = await events.get('before_agent_start')({}, ctx);
  assert.doesNotMatch(injected.message.content, /CAVEMAN MODE ACTIVE/);
  assert.match(injected.message.content, /PONYTAIL MODE ACTIVE — level: lite/);

  await commands.get('caveman').handler('full', ctx);
  assert.match(notifications.at(-1).message, /Caveman mode set to full\./);
  assert.equal(widgetLine(), 'Ponytail lite • Caveman full');
  assert.deepEqual(appended.at(-1), { customType: 'caveman-mode', data: { enabled: true, mode: 'full' } });

  await commands.get('ponytail').handler('repo off', ctx);
  assert.match(notifications.at(-1).message, /Repo Ponytail set to off\./);
  assert.deepEqual(readConfig(repoConfigPath).ponytail, { mode: 'ultra', enabled: false });
  assert.equal(widgetLine(), 'Caveman full');

  await commands.get('caveman').handler('global wenyan-lite', ctx);
  assert.match(notifications.at(-1).message, /Global Caveman mode set to wenyan-lite\./);
  assert.deepEqual(readConfig(globalConfigPath).caveman, { enabled: true, mode: 'wenyan-lite' });
  assert.equal(widgetLine(), 'Caveman wenyan-lite');

  await commands.get('caveman').handler('repo on', ctx);
  assert.match(notifications.at(-1).message, /Repo Caveman set to on\./);
  assert.deepEqual(readConfig(repoConfigPath).caveman, { enabled: true });
  assert.equal(widgetLine(), 'Caveman wenyan-lite');


  console.log('ponytail-caveman smoke test ok');
} finally {
  if (oldAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = oldAgentDir;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}
