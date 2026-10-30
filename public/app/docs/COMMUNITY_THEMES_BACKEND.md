# Community themes: publication and account lifecycle

This delivery provides a free theme marketplace using the existing ALTARA account
and widget marketplace conventions. Local lifecycle checks run against an isolated
PostgreSQL 17.11 cluster with explicit Auth fixtures. Following the user's specific
deployment approval on 2026-10-08, `community_themes_lifecycle_v1` was applied to the
existing ALTARA production project and `theme-api` version 1 was deployed.
Production checks confirmed the public empty catalogue, unauthenticated write
denial, input rejection, database grants, RLS and release/revocation triggers.
No theme or test account content was published in a real user account. The full
two-account hosted publication/install flow and moderator handling remain
unverified; local fixtures are not evidence of those hosted user journeys.

## Authority and storage

`supabase/migrations/20261008173321_community_themes_lifecycle_v1.sql` adds
`altara_theme_projects`, private drafts, immutable releases and account installs.
Its approved production application is recorded under generated remote migration
version `20261008214839`, name `community_themes_lifecycle_v1`. The local filename
remains unchanged to preserve the prepared source. Do not apply it a second time;
reconcile this receipt with migration history before any future bulk CLI push.
The public site now serves `/themes`, `/developers/themes` and
`/developers/themes/guide` at `https://www.altaraapp.com`. Public browser checks
covered the empty real catalogue, source-kit download integrity, normal sign-in
return route, Marketplace navigation and 1360/390-pixel layouts.
The private schema contains report rate-limit evidence and the bridge to the
existing moderation queue. The bridge supports the audited
`public.submit_report(uuid,uuid,uuid,text,jsonb)` contract with explicit null
message/conversation IDs, and the three-argument `(uuid,text,jsonb)` contract.
When both exist it selects the complete five-argument overload to avoid an
ambiguous call through optional defaults. Unknown signatures fail closed before
calling the queue or consuming a theme report slot. The reporter remains
`auth.uid()`; target creator and release evidence are resolved by the database.

No new subscription or paid capability is required. Payments, commissions and
payouts are outside this implementation.

The `theme-api` Edge Function accepts the normal ALTARA user bearer token and
verifies it with `auth.getUser(token)`. It does not accept `user_id`, `creator_id`,
publication authority, package hashes or author ownership in a request body.
The textual `package.author` remains descriptive package metadata. Public creator
identity is resolved from the project's server-owned `creator_id` and the existing
profile's public display fields. Private profile fields are never returned.

The database write RPC, `altara_theme_api_v1`, is `SECURITY INVOKER` and callable
only by `service_role`. The Edge Function supplies its verified actor. Every
ownership-dependent operation rechecks ownership inside the transaction. Client
roles have no direct DML grants on these tables. The install table has owner-only
read access for RLS-filtered revocation events; it contains IDs and state, never
theme assets, messages or widget data. The other public-schema tables have RLS
enabled and explicit owner read policies as defence in depth, without client table
read grants.

RLS, grants and RPC checks are tested even under hosted-style default privileges
that would otherwise grant tables/functions to public roles. There are no public
`SECURITY DEFINER` writes. The narrowly privileged report implementation lives in
the non-exposed private schema and uses the authenticated session's `auth.uid()`.

## Request contract

All requests use `POST /functions/v1/theme-api`, JSON `{ "op": "…", … }`.
Unknown fields and operations are rejected. IDs use UUIDs. The total request body
is capped at 3 MiB before parsing. Protected operations authenticate before
compiling theme CSS or decoding asset containers.

| Operation | Fields | Result |
| --- | --- | --- |
| `catalogue` | optional `query` (120 characters), `limit` (1–48), `offset` (0–2000) | `themes`, `total` |
| `detail` | `project_id` | `project`, `releases` metadata |
| `projects` | none | creator-owned projects and private drafts |
| `save_draft` | `package`; optional new-project `project_id`; required `expected_revision` when editing; optional `screenshots`, `release_notes` | saved `project`, new revision |
| `publish` | `project_id`, `expected_revision` | project and immutable `release` |
| `release` | `release_id` | release with canonical `package_text` and `sha256` |
| `installs` | none | account `installs` |
| `install` | `release_id` | account `install`; never activates |
| `accept_update` | `install_id`, `release_id` | explicitly replaced installed release |
| `uninstall` | `install_id` | `ok`; no widget/message changes |
| `set_visibility` | `project_id`, `visibility: "public"` or `"unlisted"` | project |
| `revoke` | `release_id`, `reason` (10–500 characters) | revoked release metadata |
| `report` | `release_id`, `category: "privacy"`, `"harmful"`, `"broken"` or `"other"`; `details` (10–2000 characters) | report receipt |

`catalog`, `details`, `mine` and `library` remain aliases of the corresponding read
operations. `catalogue`, `detail` and `release` permit anonymous reading of public,
published releases. Supabase's automatically supplied public anon bearer key is
treated as **no user**, never as an inferred user identity. Other operations reject
missing, invalid or anonymous-user sessions.

A successful reply has `{ "ok": true, … }`. Failures return a stable lowercase
`error` plus a safe `message`, with suitable HTTP status (400 validation, 401 auth,
403 denial, 404 unavailable, 409 version/revision conflict, 429 limits, 503 service
failure). Raw SQL errors, secrets and credentials are not exposed.

Public project fields are `id`, `creator_id`, `creator_name`, `creator_username`,
`name`, `description`, `visibility`, `revision`, `latest_release_id`, `latest_version`,
`api_version`, `screenshots`, `created_at`, `updated_at` and `downloads`. The
catalogue returns only the first presentation image; detail returns the complete
gallery. `downloads` is the current number of distinct installed accounts, not
an invented historical lifetime download counter.

Owned projects also expose `draft_package`, `draft_sha256`,
`draft_release_notes`, `draft_screenshots`, `draft_name` and `draft_description`.
Omitting screenshot or release-note fields when editing preserves the previous
draft values. Explicit empty arrays/strings clear them.

Releases return `id`, `project_id`, `version`, `api_version`, `sha256`,
`release_notes`, `status`, `created_at`, and `package_text` when package content is
requested. Parsed package objects are not duplicated on the wire: clients verify
and parse the canonical text once. An installation additionally returns its own
`id`, `release_id`, `disabled`, `unavailable_reason`, `latest_release_id`,
`latest_version`, `update_available`, `installed_at`, `updated_at`, and public
`project` metadata.

## Validation and integrity

Run `node scripts/sync-theme-validator.cjs` after changing the client validator.
The script generates the Edge validator and copies the already pinned MIT
CSS-tree distribution and notices. `--check` fails if any generated file differs.
Do not edit the generated validator or make a second independently maintained
CSS/asset allowlist.

The publication boundary applies the same API 1/API 2 structural package,
CSS-tree AST, selector scoping, trusted-surface protection, local asset and size
limits as the client. Static PNG/JPEG/WebP containers are checked for format,
chunk/header structure, dimensions, pixel bounds and animation rejection. Remote
resources, imports, executable code, author SVG and HTML are denied. There is no
widget JavaScript runtime in theme packages.

Canonical bytes are JSON of the normalized package with object keys recursively
sorted and array order preserved. SHA-256 covers exactly its UTF-8 bytes. The
database independently verifies the hash of stored drafts and releases. Before
publication, the Edge Function reloads the owner-private draft, validates it again,
and confirms canonical bytes/hash. The publish transaction checks the same hash
and revision again, protecting the gap between read/validation and commit.

Published package text, author binding, metadata, gallery and release notes are
immutable, including under direct service writes. A new package requires a new
semver, and a new published version must increase. Revocation is irreversible;
recover by publishing a later corrected release, not by resetting an unsafe one.
Revocation changes only status/reason and propagates a server-owned `disabled`
bit to all installations. RLS-filtered realtime install events support immediate
client recovery, and normal startup/focus checks recover missed events.

## Limits and failure semantics

- 20 projects per creator; 20 releases per creator/hour, transactionally locked.
- 20 account installations and 3 MiB total installed canonical package text.
- Existing 1.5 MiB API 2 package cap and all parser/asset complexity caps remain.
- Up to three validated presentation thumbnails: at most 640 pixels on either
  dimension and 96 KiB of file bytes each. The complete screenshot JSON is capped
  at 512 KiB. The app/portal uploader decodes the original locally and resizes it
  before publication; the server rejects over-limit originals even if a caller
  bypasses that uploader. API 2 wallpaper/assets keep their separate existing
  512 KiB/image, 4096-pixel and 12-megapixel limits.
- Five theme reports per authenticated reporter/day; serialised per reporter.

`install` is idempotent per account/project and preserves an already installed
release, even if the caller specifies a newer release. `accept_update` binds the
exact owned install to a strictly newer release of that same project. A refused
update does not mutate anything. Integrity, revision, quota and SQL failures leave
the previous database state intact. Client device-storage failure after a server
commit must be presented distinctly: the account version may have been saved
while the device keeps its previous appearance and needs a retry.

Unlisting removes discovery and anonymous package access but preserves already
installed versions. Revocation blocks installation and marks previous installs
disabled so the app can return to base appearance. Incompatible API versions are
rejected before application. Recovery controls and keyboard recovery remain
app-owned and independent of account or network access.

## Local evidence and remaining rollout

`tests/community-theme-backend.test.mjs` exercises actual isolated PostgreSQL
17.11 transactions, RLS/grants, two distinct account IDs, private drafts, IDOR
denial, immutable releases, exact hashes, explicit install/update, withdrawal,
revocation, concurrent edits/publication/install, quotas and rollback. Its HTTP
integration runs the actual Edge handler against that real database. Supabase
Auth is an explicit verified-identity fixture; a live GoTrue/JWKS authentication
service was **not** exercised. The moderation bridge test substitutes a local
`submit_report` adapter to inspect identity/evidence. It does not prove the live
moderation queue or moderator tools.

The focused backend suite passes 19 tests, zero skipped, including the independent
thumbnail bounds, shared PNG checksum/header validation and real PostgreSQL
moderation signature compatibility checks. Deno 2.2.5
`check --no-config --no-lock` accepts the actual Edge entry. Supabase CLI 2.117.0
`db advisors` reported no issues against a fresh loopback cluster with only the
prepared schema and test baselines. This is not an audit of the existing hosted
database or every unrelated migration. Test clusters and logs are preserved; they
are stopped after validation and are not deleted by the test.

To run the PostgreSQL checks, set `ALTARA_THEME_PG_BIN` to an existing PostgreSQL
binary directory and `ALTARA_THEME_PG_WORK` to a writable test evidence directory,
then run `node --test tests/community-theme-backend.test.mjs`. The test creates a
fresh loopback-only cluster; it does not connect to any configured production
database. With no binary/evidence paths supplied, the real PostgreSQL test is
explicitly skipped.

Remaining hosted verification (the migration and Edge deployment are complete):

1. Apply the additive migration in an isolated Supabase staging environment;
   verify existing profile schema, service role access and moderation function,
   including its argument names (`p_target_user_id`, `p_message_id`,
   `p_conversation_id`, `p_reason`, `p_metadata` for the existing five-argument
   queue). Local regressions cover both supported overloads, simultaneous
   overloads, unknown signatures, exact evidence and authenticated reporter.
2. `theme-api` uses its prepared configuration and normal environment
   `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. These secrets
   stay only in the server environment. `verify_jwt=false` delegates public reads
   and Auth verification to this handler; it does not permit unverified writes.
3. Run the app and portal with two real staging account sessions, including
   logout/switch, interrupted network, denied foreign mutation, installation,
   preview, explicit update, withdrawal and a safety revocation realtime event.
4. Confirm moderator handling of `source: "theme"` in the existing report queue.
   Moderator revocation must be performed only by a trusted server/service
   authority; clients cannot supply moderator roles. Verify the actual queue and
   moderator workflow before calling the public platform validated.
5. Run advisors/security checks in staging and review visual/user flows.
   Publish ALTARA Glass only after a
   specific account-publication instruction; this implementation does not seed
   real marketplace content or silently publish on the creator's behalf.

Current platform references checked during implementation:
[Supabase changelog](https://supabase.com/changelog),
[Edge authentication](https://supabase.com/docs/guides/functions/auth),
[RLS and explicit grants](https://supabase.com/docs/guides/database/postgres/row-level-security).
