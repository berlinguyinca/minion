# Configurable MAP command design

## Goal
Allow users to run the pipeline and GUI against a locally checked-out MAP development branch instead of the globally installed `map` binary. This should work for commands such as `npm run map --`, `pnpm --dir ../multi-agent-pipeline start --`, or any executable plus default arguments.

## Configuration
Add top-level config keys:

```yaml
mapCommand: npm
mapArgs:
  - run
  - map
  - --
mapModel: claude-sonnet-4-5
mapTimeoutMs: 1800000
```

`mapCommand` defaults to `map`. `mapArgs` defaults to `[]`. Generated runtime arguments (`--version`, `--headless`, `--output-dir`, `--config`, personality, prompt) are appended after `mapArgs`, so npm/pnpm users can include the required `--` separator in `mapArgs`.

## Runtime behavior
- Full issue runs (`MAPWrapper`) use configured command and args for detection and headless invocation.
- GUI/TUI polish/optimization uses the same configured command, args, and timeout.
- Existing configs remain valid without changes.
- CLI `--repo` mode also accepts `--map-command` and repeatable `--map-arg` flags for one-off local development runs.

## Tests
- Config parser preserves `mapCommand` and `mapArgs` from JSON/YAML.
- MAP wrapper invokes custom command with default args before generated headless args.
- MAP detection invokes custom command with default args before `--version`.
- Polish/optimization invokes custom command/args and timeout.
- CLI flag mode passes command and args through to the MAP provider config.
