# Features — v0.7.0

Prepared 2026-09-22. Status: pending PR review and merge.

## Release summary

Version `v0.7.0` introduces portable dataset packages for silicon-photonics measurement data while returning the app to one shared public-library workflow. There are no user accounts, API keys, role badges or admin-only screens in the interface.

## Portable WST project packages

Saved Dataset Snapshots now imports and exports `.wstpkg` archives. An archive contains a manifest, README, snapshot metadata and chunked measurement rows. Importing a package automatically saves every contained dataset in the recipient's local Saved Dataset Snapshots without publishing anything to GitHub.

Choose an export scope in Saved Dataset Snapshots:

- **Export this dataset**: one snapshot.
- **Export same project**: every local snapshot with the same stored project code.
- **Export selected**: only the checked snapshots; mixed projects are supported.
- **Export all datasets**: every locally saved snapshot.

The package format supports large datasets by storing rows as chunked NDJSON files rather than one monolithic JSON payload.

## Sharing boundary and limitations

`.wstpkg` files are portable but not encrypted. Send confidential packages only using an approved encrypted transfer method, and never add confidential package files or measurements to the public GitHub repository.
