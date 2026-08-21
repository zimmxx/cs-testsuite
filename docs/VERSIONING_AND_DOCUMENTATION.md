# Versioning And Documentation Guide

This project now uses a simple documentation versioning structure so future upgrades can be tracked cleanly.

## Documentation Structure

Top-level docs:

- [README.md](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\README.md)
  High-level overview, setup, and links

- [docs/LOCAL_GIT_GITHUB_WORKFLOW.md](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\docs\LOCAL_GIT_GITHUB_WORKFLOW.md)
  Local Git and deployment workflow

- [docs/DATASET_FILENAME_STANDARD.md](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\docs\DATASET_FILENAME_STANDARD.md)
  Standard naming guide for datasets, traces, and converted archives

- [docs/VERSIONING_AND_DOCUMENTATION.md](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\docs\VERSIONING_AND_DOCUMENTATION.md)
  This versioning guide

Version-specific docs:

- `docs/releases/v0.1.0/FEATURES.md`
- `docs/releases/v0.1.0/CHANGELOG.md`
- `docs/releases/v0.2.0/FEATURES.md`
- `docs/releases/v0.2.0/CHANGELOG.md`
- `docs/releases/v0.2.1/FEATURES.md`
- `docs/releases/v0.2.1/CHANGELOG.md`
- `docs/releases/v0.3.0/FEATURES.md`
- `docs/releases/v0.3.0/CHANGELOG.md`
- `docs/releases/v0.3.1/FEATURES.md`
- `docs/releases/v0.3.1/CHANGELOG.md`
- `docs/releases/v0.4.0/FEATURES.md`
- `docs/releases/v0.4.0/CHANGELOG.md`

Forward-planning docs:

- `docs/suggested_update.md`

Templates for future versions:

- `docs/templates/RELEASE_NOTES_TEMPLATE.md`

## How To Document A New Upgrade

When the app is upgraded from one documented version to a later version:

1. Create a new folder:

```text
docs/releases/v0.4.0/
```

2. Copy the template or previous files into the new version folder

3. Update:

- feature descriptions
- changed files
- known limitations
- new screenshots or export behavior if relevant
- dataset naming guidance if the GitHub measurement-data workflow changed

4. Add a short summary to `README.md`
5. Update any in-app documentation links so the Help section points to the latest release notes

## Suggested Version Number Format

Use:

- `v0.1.0` for current baseline release
- `v0.1.1` for small fixes
- `v0.2.0` for medium feature expansions
- `v0.2.1` for patch improvements on top of the current feature release
- `v0.3.0` for a larger feature expansion such as new library sections or new dataset workflows
- `v0.3.1` for a patch release that refines an existing workflow such as spectrum-viewer controls
- `v0.4.0` for a substantial interface and analysis-workflow upgrade such as the CORNERSTONE-branded workspace redesign
- `v1.0.0` for a more complete stable release

## Visual Development Archive

User-interface design stages and release screenshots are stored in `Screenshot - App Development/`. Add a short catalogue entry when a screenshot is added so the purpose and date remain clear.

Presentation material intended for team review is stored in `docs/`. The filename should include the release version when it documents a particular application milestone.

## What Belongs In Each File

### README.md

Use for:

- project purpose
- tech stack
- quick start
- deployment link
- documentation links

### DATASET_FILENAME_STANDARD.md

Use for:

- the controlled naming structure for datasets and trace files
- examples of standard filenames
- archive naming rules
- guidance for GitHub-hosted dataset folders

### FEATURES.md

Use for:

- what each tab does
- what each metric means
- upload behavior
- comparison behavior
- conversion behavior
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
2. update the filename standard if naming behavior changed
3. update the release feature doc if behavior changed
4. update the changelog entry
5. commit code and docs together
6. update `docs/suggested_update.md` when the latest work changes the recommended next architecture step
