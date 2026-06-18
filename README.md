# OMP Extensions

Small user-level extensions for [Oh My Pi](https://github.com/can1357/oh-my-pi).

## How to install

Clone this repository, then run the installer for the extension you want:

```sh
git clone https://github.com/phenome/omp-extensions.git
cd omp-extensions
node scripts/install-ponytail-caveman.mjs
```

Each installer copies its extension into your active Oh My Pi user extension directory (`~/.omp/agent/extensions`, or the matching `OMP_PROFILE` / `PI_PROFILE` profile directory) and installs any external skills the extension reads at runtime. Restart Oh My Pi after installing or updating an extension.

Installers are OS-agnostic Node scripts. They use `bunx` when available and fall back to `npx -y`.

## Extensions

### ponytail-caveman

Composes Ponytail and Caveman into one `before_agent_start` hook. Oh My Pi keeps only the first hook message returned, so both instruction blocks must be injected by one extension.

Runtime commands:

- `/ponytail` — enable Ponytail at the configured default mode.
- `/ponytail status` — show current Ponytail mode and default.
- `/ponytail default` — show configured Ponytail default.
- `/ponytail default lite|full|ultra|off` — set Ponytail default.
- `/ponytail lite|full|ultra|off` — set current Ponytail mode.
- `/caveman` or `/caveman status` — show Caveman ultra state.
- `/caveman on|off` — enable or disable Caveman ultra injection.

Detached skill sources:

- Ponytail: `skills add DietrichGebert/ponytail -g --skill '*' -y`
- Caveman: `skills add https://github.com/juliusbrussee/caveman -g --skill caveman -y`

The installer runs those through `bunx` or `npx -y`. The extension reads installed skills from `~/.agents/skills/<name>/SKILL.md`, so future skill updates remain managed by the `skills` CLI.

## Updating

```sh
git pull
node scripts/install-ponytail-caveman.mjs
```

To refresh detached skills directly, use your available runner:

```sh
bunx skills update -g
# or
npx -y skills update -g
```
