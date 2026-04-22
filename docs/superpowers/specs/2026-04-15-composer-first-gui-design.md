# Composer-First GUI Design

## Goal

Make `minion --gui` primarily a fast GitHub issue composer. The default screen should focus title and description, with repo selection, existing issues, and MAP output secondary and compact.

## Requirements

- Default view is a centered new-issue composer.
- Repo selector is a compact searchable dropdown in the top bar.
- Existing issues are collapsed by default and used only as duplicate/reference context.
- MAP output is collapsed by default and expands when running MAP.
- Buttons are compact and developer-tool dense.
- `Cmd/Ctrl+Enter` creates the issue.
- `Cmd/Ctrl+R` creates the issue and runs MAP.
- Comments are not shown in the create-first default path.
- Existing issue opening/editing remains possible from the collapsed issue drawer.
