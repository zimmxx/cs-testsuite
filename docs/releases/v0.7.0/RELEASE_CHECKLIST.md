# Release checklist — v0.7.0

Prepared 2026-09-22. Status: pending PR review and merge.

- [x] Package version, README, Help links, project history and release documentation updated.
- [x] Public MPW47_DTU dataset assets removed from the public GitHub library in the private-library branch.
- [x] `private/` is ignored by Git and excluded from Vite public assets.
- [x] Production Vite build passed.
- [x] `.wstpkg` multi-project import/export round-trip verified, including 4,101-row chunking coverage.
- [x] Local browser verified: selecting a dataset enables Export selected; row controls show individual and same-project exports.
- [ ] User reviews and merges this PR.
- [ ] GitHub Pages deployment completes after merge and is smoke-tested as a guest.
- [ ] A separate private repository/object store and server-side identity service are provisioned before sharing confidential data in production.
- [ ] SSO/OIDC, audit records, HTTPS, rate limiting and encrypted storage/transfer are validated before multi-user partner access.

Reproduce the core checks:

```sh
node node_modules/vite/bin/vite.js build
```

Browser-local snapshots and downloaded `.wstpkg` files are not source-controlled release artifacts.
