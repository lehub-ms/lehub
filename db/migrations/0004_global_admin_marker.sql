-- 0004_global_admin_marker
--
-- Story #106. The API arbitrates every write on what the LeHub database says, never on a
-- claim and never on a call to the tenant, so the database has to say who is a global
-- administrator. This migration is where it starts saying it.
--
-- A boolean marker rather than a three-valued role column, because "organiser" is not a
-- stored role: it is read from dbo.CommunityOrganizer (0005), which makes it impossible to
-- have an organiser without a community, or a community whose organiser silently lost the
-- role. Only the global marker needs a home of its own.
--
-- No GO: the migration runner wraps this file in a single transaction, which is only
-- possible in one batch. See db/README.md.

-- NOT NULL with a default: every existing row becomes 0 in place. The first administrator
-- cannot come from the backoffice — there would be nobody to create them — so it comes from
-- the environment's seed data instead. See dbo.AdminBootstrap below.
ALTER TABLE dbo.[User] ADD IsGlobalAdmin BIT NOT NULL
  CONSTRAINT DF_User_IsGlobalAdmin DEFAULT 0;

-- ─── Bootstrap of the first administrators ───────────────────────────────────
--
-- The obvious implementation of "promote this address" is an UPDATE in the seed file, and
-- it fails both of story #106's replay rules: replayed after an administrator was removed
-- from the backoffice it would silently promote them again, and it does nothing at all for
-- an address whose account has not signed in yet — which is the normal case on a fresh
-- environment, where the seed runs long before anyone connects.
--
-- This table is the intent, kept apart from its effect. The seed only ever *registers* an
-- address here; the promotion happens on that account's next sign-in (api/src/lib/userRepo.ts),
-- which then stamps AppliedAt. Both rules follow from that single column:
--
--   - replaying the seed re-registers nothing, and AppliedAt stays set, so a removed
--     administrator is never promoted a second time;
--   - an address unknown to dbo.[User] is not an error, it simply waits.
--
-- The address, rather than the object identifier, because the object identifier is only
-- known once the account exists — and the whole point is to name it before it does.
CREATE TABLE dbo.AdminBootstrap (
  Email     NVARCHAR(320) NOT NULL,
  -- NULL means pending: the promotion has not been applied yet.
  AppliedAt DATETIME2(3)  NULL,
  CONSTRAINT PK_AdminBootstrap PRIMARY KEY (Email)
);
