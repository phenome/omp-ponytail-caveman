# Ponytail Caveman

Ponytail Caveman is an Oh My Pi extension that controls Ponytail and Caveman instruction modes for an agent session.

## Language

**Mode Command**:
A slash command that changes the active behavior for the current session only. It does not persist future-session defaults.
_Avoid_: Sticky command, persistent mode command

**Scoped Default Command**:
A slash command that writes a future-session default to an explicit scope, such as `global` or `repo`, and also applies the same state to the current session. It patches one tool only and preserves other tools in the same Config File.
_Avoid_: Default command, sticky command, persistent mode command

**Bare Command**:
A slash command with no arguments. In this extension, a Bare Command reports status and never changes active behavior.
_Avoid_: Default action, implicit enable

**Enabled State**:
Whether Ponytail or Caveman is active in the current session or future-session default. Enabled State is separate from Mode so disabling does not erase the remembered Mode.
_Avoid_: Off mode, disabled mode

**Mode**:
The intensity or style level used when a tool is enabled, such as `lite`, `full`, or `ultra`. `off` is not a Mode.
_Avoid_: Enabled state, activation state

**Argument Completion**:
Static tab completion for valid slash-command arguments. It suggests known tokens only and does not act as an interactive menu.
_Avoid_: Autocomplete UI, suggestion engine

**Plugin Package**:
The installable OMP plugin package for this repo. Its package name matches the repository name `omp-ponytail-caveman`.
_Avoid_: Extension package, extension repo, feature name

**Status Surface**:
The UI places where active state appears: a persistent widget plus command-change notifications. Bare status commands report current session state, all configured scopes, and concise command usage.
_Avoid_: Announcement message, injected status

**Config File**:
The saved default state file named `ponytail-caveman.json`. Its name follows the user-facing feature name, not the `omp-` package prefix.
_Avoid_: Package config, repo config name

**Tool State**:
The pair of Enabled State and Mode for one tool. Config stores Ponytail and Caveman as the same Tool State shape.
_Avoid_: Default mode, mode-only state

**Repo Scope**:
The repository-local default target. It writes the nearest Git root `.omp/ponytail-caveman.json`, falling back to the current working directory when no Git root exists.
_Avoid_: Current-directory scope, nearest config scope

**Configuration Source**:
A global Config File, Repo Scope Config File, or current session entry. Precedence is session, then repo, then global; higher sources override individual fields and inherit missing fields from lower sources. Environment variables are not Configuration Sources for this extension.
_Avoid_: Env default, environment override

**Skill Dependency**:
The upstream Ponytail or Caveman skill file read from the agent skill directories. Missing Skill Dependencies are checked on session start, after install command, and when enabling a tool; an enabled tool with a missing dependency is surfaced in UI but does not inject fallback instructions.
_Avoid_: Vendored skill, bundled skill, fallback instructions

**Skill Install Command**:
`/ponytail install-skills` and `/caveman install-skills` run the same dependency installer for both upstream skill sets. The command refreshes both skill sets every time and is safe to rerun.
_Avoid_: Separate skill installer, package-only install
