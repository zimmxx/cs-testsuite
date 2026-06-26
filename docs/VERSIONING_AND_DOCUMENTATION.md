# Versioning And Documentation Guide

This project now uses a simple documentation versioning structure so future upgrades can be tracked cleanly.

## Documentation Structure

Top-level docs:

- [README.md](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\README.md)
  High-level overview, setup, and links

- [docs/LOCAL_GIT_GITHUB_WORKFLOW.md](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\docs\LOCAL_GIT_GITHUB_WORKFLOW.md)
  Local Git and deployment workflow

- [docs/VERSIONING_AND_DOCUMENTATION.md](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\docs\VERSIONING_AND_DOCUMENTATION.md)
  This versioning guide

Version-specific docs:

- `docs/releases/v0.1.0/FEATURES.md`
- `docs/releases/v0.1.0/CHANGELOG.md`

Templates for future versions:

- `docs/templates/RELEASE_NOTES_TEMPLATE.md`

## How To Document A New Upgrade

When the app is upgraded from `v0.1.0` to a later version:

1. Create a new folder:

```text
docs/releases/v0.1.1/
```

2. Copy the template or previous files into the new version folder

3. Update:

- feature descriptions
- changed files
- known limitations
- new screenshots or export behavior if relevant

4. Add a short summary to `README.md`

## Suggested Version Number Format

Use:

- `v0.1.0` for current baseline release
- `v0.1.1` for small fixes
- `v0.2.0` for medium feature expansions
- `v1.0.0` for a more complete stable release

## What Belongs In Each File

### README.md

Use for:

- project purpose
- tech stack
- quick start
- deployment link
- documentation links

### FEATURES.md

Use for:

- what each tab does
- what each metric means
- upload behavior
- report behavior
- user-facing limitations

### CHANGELOG.md

Use for:

- what changed in that release
- fixes
- improvements
- known issues

## Recommended Update Rule

Any time you change the app in a meaningful way:

1. update the code
2. update the release feature doc if behavior changed
3. update the changelog entry
4. commit code and docs together
