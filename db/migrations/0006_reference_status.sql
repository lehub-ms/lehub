-- 0006_reference_status
--
-- Story #155. Communities and technologies gain a status, and their names gain the
-- uniqueness #152 and #153 ask for. Neither existed in any table until now.
--
-- Why a status rather than a delete. FK_EventCommunity_Community and
-- FK_EventTechnology_Technology carry no cascade, so the database already refuses to
-- remove an entry an event references — and that is the behaviour wanted, not an obstacle:
-- LeHub's past agenda must not come apart because a community stopped its activity.
-- Withdrawal is therefore an archive, which takes the entry out of what is offered
-- (an event's attachments, the public filters) while every existing attachment stands.
--
-- Why NVARCHAR(20) with a CHECK, and not a BIT. This is the shape this schema already
-- gives a closed set of *named* states: dbo.[User].PrimaryAuthMethod and LastAuthMethod
-- in 0001. The BIT of 0004 (IsGlobalAdmin) is the shape of a boolean *marker*, which is a
-- different thing — "IsArchived" would read as a negation, and the column maps here
-- straight onto the status: 'active' | 'archived' of the API contract, with nothing to
-- translate. A lookup table is the third possible shape and belongs to FormatType and
-- EventMode, which are business vocabularies their owner edits; a status is a closed set
-- the code branches on, and a join per row to read one of two values buys nothing.
--
-- NOT NULL with a default fills every existing row in place, exactly as 0004 did, so
-- "existing entries become active" needs no DML at all — and therefore no EXEC(N'...')
-- deferral in this file.
--
-- No GO: the migration runner wraps this file in a single transaction, which is only
-- possible in one batch. See db/README.md.

ALTER TABLE dbo.Community ADD Status NVARCHAR(20) NOT NULL
    CONSTRAINT DF_Community_Status DEFAULT 'active'
    CONSTRAINT CK_Community_Status CHECK (Status IN ('active', 'archived'));

ALTER TABLE dbo.Technology ADD Status NVARCHAR(20) NOT NULL
    CONSTRAINT DF_Technology_Status DEFAULT 'active'
    CONSTRAINT CK_Technology_Status CHECK (Status IN ('active', 'archived'));

-- Uniqueness of the name is a database guarantee, not a convention the API remembers to
-- check: a read-then-insert can always be raced, and the index is what actually refuses
-- the duplicate. The API turns error 2601/2627 into its typed refusal (api/src/lib/
-- sqlErrors.ts), the same way userRepo already does for an address.
--
-- The collation is case-insensitive and accent-sensitive by default on both Azure SQL and
-- the SQL Server 2022 container, so 'azure' collides with 'Azure' and does not collide
-- with 'Azuré'. Assumed: the first is a duplicate anyone would call one, the second is a
-- judgement call the database has no business making.
--
-- These fail, and roll the whole file back, if a database already holds two entries with
-- the same name. That is the right outcome: a de-duplication step here would pick a winner
-- in silence. Neither seed carries one -- reference.sql has 13 distinct technologies,
-- demo.sql 12 distinct communities.
CREATE UNIQUE INDEX UX_Community_Name  ON dbo.Community  (Name);
CREATE UNIQUE INDEX UX_Technology_Name ON dbo.Technology (Name);
