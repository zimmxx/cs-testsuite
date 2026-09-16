# Private measurement library security

## Storage boundary

Public datasets remain in `public/sample-data/wst/` and require no login. Confidential datasets use the same package layout under local `private/sample-data/wst/`, but that entire directory is ignored by Git and is not emitted as a Vite public asset.

The local development server exposes private manifests and files only through `/api/private/*`. Requests require a high-entropy API key. Only a SHA-256 hash and six-character key hint are stored in `private/config/access-control.json`; raw keys are shown once and retained in browser session storage for the current tab.

## Roles and access groups

- **Guest:** public datasets only.
- **Viewer:** read access to private datasets whose `accessGroups` overlap the user's assigned groups.
- **Editor:** viewer access plus protected metadata editing.
- **Admin:** all private datasets, user creation, access assignment, revocation, and API-key rotation.

Partner isolation is group-based. For example, a dataset with `"accessGroups": ["dtu"]` is invisible to a user assigned only `imec`.

## GitHub deployment

Do not put confidential data in a folder of the public application repository. GitHub permissions apply at repository level, not folder level. Use a separate private repository for private dataset packages and place its fine-grained GitHub token only on a server-side service. The deployed service should implement the same authenticated API contract used locally and perform every authorization check server-side.

If confidential data was previously pushed to a public repository, deleting it in a later commit does not remove it from history. Treat the data as exposed until repository history and any forks/caches are assessed, then follow the partner's incident-handling requirements. Git history cleanup is intentionally not automated here because it rewrites shared history.

## Production hardening

Before multi-user deployment, replace API-key-only identity with institutional SSO/OIDC, store salted key hashes in a managed database, use expiring sessions, enforce HTTPS, rate-limit authentication, record server-side immutable audit events, and keep GitHub credentials in a secrets manager.
