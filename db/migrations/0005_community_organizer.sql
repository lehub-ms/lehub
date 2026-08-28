-- 0005_community_organizer
--
-- Story #107. "Organiser" is not a stored role: it is a consequence. Whoever appears in
-- this table for at least one community is an organiser of that community, and nowhere
-- else does the quality exist. That is what makes an organiser without a community, or a
-- community whose organiser silently kept the role, impossible to represent.
--
-- It also means a designation removed here takes effect on the very next request, without
-- the person having to sign in again — the API resolves this table per request (#108)
-- rather than freezing the answer into a token.
--
-- No GO: the migration runner wraps this file in a single transaction, which is only
-- possible in one batch. See db/README.md.

CREATE TABLE dbo.CommunityOrganizer (
  CommunityId  UNIQUEIDENTIFIER NOT NULL,
  UserObjectId UNIQUEIDENTIFIER NOT NULL,
  -- Who designated them. NULL for a designation that came from the seed rather than from
  -- a person — see db/seed/demo.sql.
  DesignatedBy UNIQUEIDENTIFIER NULL,
  DesignatedAt DATETIME2(3)     NOT NULL
      CONSTRAINT DF_CommunityOrganizer_DesignatedAt DEFAULT SYSUTCDATETIME(),

  -- The composite key is the uniqueness rule: the same person cannot be designated twice
  -- on the same community, and no application code has to remember to check it.
  CONSTRAINT PK_CommunityOrganizer PRIMARY KEY (CommunityId, UserObjectId),

  -- Deleting a community takes its designations with it: a designation on a community
  -- that no longer exists grants nothing and would only be a row nobody can reach.
  CONSTRAINT FK_CommunityOrganizer_Community FOREIGN KEY (CommunityId)
      REFERENCES dbo.Community (Id) ON DELETE CASCADE,
  CONSTRAINT FK_CommunityOrganizer_User FOREIGN KEY (UserObjectId)
      REFERENCES dbo.[User] (ExternalIdObjectId) ON DELETE CASCADE,

  -- No cascade on the trace, and it cannot have one: SQL Server refuses two cascading
  -- paths from the same table to the same table. It stays an audit column — deleting the
  -- account that did the designating would be refused, which LeHub never does today, and
  -- is in any case the right way round for a trace.
  CONSTRAINT FK_CommunityOrganizer_DesignatedBy FOREIGN KEY (DesignatedBy)
      REFERENCES dbo.[User] (ExternalIdObjectId)
);

-- The primary key answers "who organises this community"; this index answers "which
-- communities does this account organise", which is the read #108 performs on every
-- authenticated request.
CREATE INDEX IX_CommunityOrganizer_UserObjectId ON dbo.CommunityOrganizer (UserObjectId);
