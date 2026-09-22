# Changelog — v0.7.0

Prepared 2026-09-22. Status: pending PR review and merge.

## Added

- Portable `.wstpkg` import/export containing WST snapshot metadata, README and measurement rows.
- Export-scope controls for an individual snapshot, selected snapshots, all matching project snapshots or every local snapshot.
- Chunked NDJSON package data so large snapshots do not require one oversized JSON string.

## Changed

- Settings, Dataset Snapshots and Help links now reflect the shared public-library and package workflow.
- App version changed from `0.6.0` to `0.7.0`.

## Removed

- User account badge, API-key sign-in, private-library service and admin-only user-management controls.

## Security notes

- Package exports are not encrypted and must be shared only through an approved secure-transfer process.
