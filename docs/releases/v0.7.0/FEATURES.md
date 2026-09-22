# Features — v0.7.0

Prepared 2026-09-22. Status: pending PR review and merge.

## Release summary

Version `v0.7.0` introduces a controlled local workflow for confidential silicon-photonics measurement data and portable dataset packages. Public data stays available to guests. Private partner data is kept outside the public app assets and is accessed through a local authenticated API during development.

## Private Measurement Data Library

Private datasets use the same WST folder conventions as the public library, including dataset README files, metadata, route configuration and waveguide configuration. They live under the ignored `private/sample-data/wst/` path, not under `public/`, so they are neither committed to the public repository nor copied into the Vite build.

The local service supports four roles:

- **Guest:** public library only.
- **Viewer:** assigned private datasets are readable.
- **Editor:** assigned private datasets are readable and their protected metadata is editable.
- **Admin:** all private datasets plus account management, group assignment, revocation and API-key rotation.

Access is group-based. A DTU user, for example, can only see private datasets whose access groups include `dtu`.

## Accounts and administration

Settings shows the current account and accepts an approved private-library API key. The user-management view is available only to the admin and creates users, assigns access groups, sets view/edit capability, revokes access and rotates API keys. Raw keys are intentionally shown only once and are retained only in browser session storage for the active tab.

## Portable WST project packages

Saved Dataset Snapshots now imports and exports `.wstpkg` archives. An archive contains a manifest, README, snapshot metadata and chunked measurement rows. Importing a package automatically saves every contained dataset in the recipient's local Saved Dataset Snapshots without publishing anything to GitHub.

Choose an export scope in Saved Dataset Snapshots:

- **Export this dataset**: one snapshot.
- **Export same project**: every local snapshot with the same stored project code.
- **Export selected**: only the checked snapshots; mixed projects are supported.
- **Export all datasets**: every locally saved snapshot.

The package format supports large datasets by storing rows as chunked NDJSON files rather than one monolithic JSON payload.

## Security boundary and limitations

`.wstpkg` files are portable but not encrypted. Send confidential packages only using an approved encrypted transfer method. The local API is a development implementation; a real deployment must use a separate private repository or object store and enforce authentication and authorisation server-side. See the [Private Library Security Guide](../../PRIVATE_LIBRARY_SECURITY.md).
