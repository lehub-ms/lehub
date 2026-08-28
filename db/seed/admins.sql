-- Bootstrap of the environment's first global administrators.
--
-- Templated, on the same pattern as db/bootstrap/create-mi-user.sql: scripts/db-seed.sh
-- replaces the placeholder in the VALUES list below with one `(N'address')` row per address
-- of LEHUB_BOOTSTRAP_ADMIN_EMAILS. Applied after reference.sql, and skipped entirely when
-- the variable is unset — an environment with no bootstrap address is a normal state, not
-- a failure.
--
-- The placeholder is deliberately named nowhere else in this file: the substitution is a
-- global one, and a second occurrence inside a comment would be replaced too — turning a
-- multi-line address list loose in the middle of a `--` line.
--
-- Reference data rather than demonstration data: an environment without a single
-- administrator has an unadministrable backoffice, which is as true of prod as of local.
-- The addresses themselves are the environment's, not the file's, which is why they are
-- templated rather than written here.
--
-- This file registers an intent; it promotes nobody. The promotion happens on the named
-- account's next sign-in and stamps AppliedAt then — see the header of
-- db/migrations/0004_global_admin_marker.sql for why the two are kept apart, and
-- api/src/lib/userRepo.ts for where the second half happens.

SET NOCOUNT ON;

-- WHEN NOT MATCHED only. An address already registered keeps its AppliedAt, so replaying
-- this seed never re-arms a promotion that has already been applied — which is what stops
-- it from silently reinstating an administrator removed from the backoffice.
MERGE dbo.AdminBootstrap AS target
USING (VALUES
<BOOTSTRAP_ADMIN_EMAILS>
) AS source (Email)
ON target.Email = source.Email
WHEN NOT MATCHED THEN INSERT (Email) VALUES (source.Email);
