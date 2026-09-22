# Changelog — v0.7.0

Prepared 2026-09-22. Status: pending PR review and merge.

## Added

- Local private-library API, ignored confidential-data storage and API-key account flow.
- Guest, viewer, editor and admin roles with partner access groups and admin-only user management.
- Private-library security guide and deployment boundary documentation.
- Portable `.wstpkg` import/export containing WST snapshot metadata, README and measurement rows.
- Export-scope controls for an individual snapshot, selected snapshots, all matching project snapshots or every local snapshot.
- Chunked NDJSON package data so large snapshots do not require one oversized JSON string.

## Changed

- Confidential MPW47_DTU public assets were removed from the public GitHub library.
- Settings, Dataset Snapshots and Help links now reflect the private-library and package workflow.
- App version changed from `0.6.0` to `0.7.0`.

## Security notes

- The `private/` directory is ignored by Git and is not a Vite public asset.
- The local implementation is not a replacement for production SSO, server-side access control or encrypted storage/transfer.
- Package exports are not encrypted and must be shared only through an approved secure-transfer process.
