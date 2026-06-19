# Ponytail Caveman

Ponytail + Caveman extension for [Oh My Pi](https://github.com/can1357/oh-my-pi).

## How to install

Install:

```sh
omp plugin install github:phenome/omp-extensions
```

This installs the package as `ponytail-caveman`, even though the repo is named `omp-extensions`; OMP resolves Git plugin identity from `package.json#name`.

`github:phenome/omp-extensions/ponytail-caveman` is not valid `omp plugin install` shorthand today; shorthand accepts `github:user/repo[#ref]`, not a repo subdirectory. For multiple cleanly named remote extensions, use one installable package per extension: separate repos, or publish separate npm packages from a monorepo.

Marketplace `git-subdir` is not a replacement here because marketplace-installed plugins do not load extension modules.

Restart Oh My Pi after installing.

**Extension** — OMP reads `package.json` (`omp.extensions`) and loads `ponytail-caveman` automatically. No manual copying into an extensions folder.

**Detached skills are mandatory.** The extension reads Ponytail and Caveman from global `skills` CLI installs; it does not vendor them and it does not install them during OMP sessions.

Install both required skill sets immediately after plugin install:

```sh
node ~/.omp/plugins/node_modules/ponytail-caveman/scripts/install-ponytail-caveman.mjs
```

That script installs:

- Ponytail skills with `skills add DietrichGebert/ponytail -g --skill '*' -y`
- Caveman with `skills add https://github.com/juliusbrussee/caveman -g --skill caveman -y`

`package.json` also includes a `postinstall` script for this step, but Bun may block dependency lifecycle scripts until trusted. Treat the explicit command above as the reliable install step.

This repo currently ships only `ponytail-caveman`.

## Extensions

### ponytail-caveman

Composes Ponytail and Caveman into one `before_agent_start` hook. Oh My Pi keeps only the first hook message returned, so both instruction blocks must be injected by one extension.

Runtime commands:

- `/ponytail` — enable Ponytail at the configured default mode.
- `/ponytail status` — show current Ponytail mode and default.
- `/ponytail default` — show configured Ponytail default.
- `/ponytail default lite|full|ultra|off` — set Ponytail default.
- `/ponytail lite|full|ultra|off` — set current Ponytail mode.
- `/caveman` or `/caveman status` — show current Caveman mode, or `off`.
- `/caveman lite|full|ultra|wenyan-lite|wenyan-full|wenyan-ultra` — set current Caveman mode.
- `/caveman on|off` — enable Caveman at the current mode, or disable it.
- `/caveman default` — show configured Caveman default.
- `/caveman default lite|full|ultra|wenyan-lite|wenyan-full|wenyan-ultra` — set Caveman default.
- `/caveman default on|off` — set whether Caveman starts enabled.

#### Configuration

Defaults resolve in this order (lowest → highest):

1. **Built-ins** — Ponytail `full`, Caveman `ultra` enabled.
2. **Global OMP config** — `~/.omp/agent/ponytail-caveman.json`, or `~/.omp/profiles/<profile>/agent/ponytail-caveman.json` when `OMP_PROFILE` / `PI_PROFILE` is set.
3. **Nearest repo-local OMP config** — `<repo>/.omp/ponytail-caveman.json` (walks up from the current working directory).
4. **Environment variables** — `PONYTAIL_DEFAULT_MODE`, `CAVEMAN_DEFAULT_MODE`, `CAVEMAN_DEFAULT_ENABLED`.
5. **Current session command state** — `/ponytail lite|full|ultra|off` and `/caveman lite|full|ultra|wenyan-lite|wenyan-full|wenyan-ultra|on|off` (session-only; not written to disk).

Example global or repo-local file:

```json
{
  "ponytail": {
    "defaultMode": "ultra"
  },
  "caveman": {
    "enabled": true,
    "mode": "ultra"
  }
}
```

Set `caveman.mode` to any Caveman mode; omitted value defaults to `ultra`.

Environment variables override JSON defaults for new sessions:

| Variable | Values | Effect |
|----------|--------|--------|
| `PONYTAIL_DEFAULT_MODE` | `lite`, `full`, `ultra`, `off` | Default Ponytail mode |
| `CAVEMAN_DEFAULT_ENABLED` | `true` / `false`, `on` / `off`, `1` / `0` | Default Caveman injection |
| `CAVEMAN_DEFAULT_MODE` | `lite`, `full`, `ultra`, `wenyan-lite`, `wenyan-full`, `wenyan-ultra` | Default Caveman mode |

`/ponytail default <mode>`, `/caveman default <mode>`, and `/caveman default on|off` persist defaults to the **global** OMP config file only (`~/.omp/agent/ponytail-caveman.json`, or the matching profile path). They never write `<repo>/.omp/ponytail-caveman.json`; edit repo-local files manually for per-project defaults.

Detached skill sources:

- Ponytail: `skills add DietrichGebert/ponytail -g --skill '*' -y`
- Caveman: `skills add https://github.com/juliusbrussee/caveman -g --skill caveman -y`

The postinstall script runs those through `bunx` or `npx -y`. The extension reads installed skills from `~/.agents/skills/<name>/SKILL.md`, so future skill updates remain managed by the `skills` CLI.

## Updating

For GitHub installs, clean reinstall is the reliable update path because the plugin manager has no dedicated update command and repeated installs may keep the existing Bun git checkout:

```sh
omp plugin uninstall omp-extensions
omp plugin uninstall ponytail-caveman
omp plugin install github:phenome/omp-extensions
```

Restart Oh My Pi after updating.

To refresh detached skills directly, use your available runner:

```sh
bunx skills update -g
# or
npx -y skills update -g
```
