-- 0007_community_slug
--
-- Story #166. A community gains a readable address. The backoffice screens of the community
-- section are addressed by `/c/azure-user-group-france/evenements` rather than by
-- `/c/C1C1C1C1-0000-0000-0000-000000000001/evenements`, which is illegible, copies badly and
-- puts a technical key in a shared link.
--
-- The identifier stays the primary key and stays what the API accepts: the slug is a way of
-- addressing a community, not a second identity. Nothing in dbo references it.
--
-- NVARCHAR(80) while the generator stops at 60: the spare characters are the room a `-2`
-- disambiguation suffix needs, and the room an administrator has to type a longer one by hand.
--
-- The backfill below is a one-shot approximation of slugify() in api/src/lib/slug.ts. The two
-- only have to agree on the corpus that exists — api/test/seedSlug.test.ts checks that they do
-- for the seeded communities — and a divergence is corrected by editing the slug in the panel,
-- which #166 allows.
--
-- No GO: the migration runner wraps this file in a single transaction, which is only possible
-- in one batch. See db/README.md. Everything after the ALTER is therefore deferred through
-- EXEC, because T-SQL resolves column names for the whole batch up front and `Slug` does not
-- exist yet at compile time.

ALTER TABLE dbo.Community ADD Slug NVARCHAR(80) NULL;

EXEC(N'
-- Materialised rather than chained in CTEs: the sweep below is a loop, and a CTE cannot hold
-- one.
SELECT
  Id,
  Name,
  -- Accents stripped without a scalar function, and the collation is not decoration: the
  -- Unicode string is converted to a single-byte code page that has no accented Latin letter,
  -- so é degrades to e and ç to c on the way through. CP1253 is Greek, which is exactly why it
  -- works -- an accent-insensitive *Latin1* collation keeps every accent, because Latin1 can
  -- represent them. What the code page cannot represent at all -- an ideogram, an emoji --
  -- becomes "?", which the sweep turns into a separator, and that is what makes an
  -- untransposable name collapse to the empty string and fall through to the fallback.
  LOWER(CONVERT(NVARCHAR(200),
    CONVERT(VARCHAR(200), Name) COLLATE SQL_Latin1_General_CP1253_CI_AI)) AS s
INTO #slug
FROM dbo.Community;

-- Everything that is not a-z, 0-9 or a dash becomes a dash, whatever it is.
--
-- A fixed TRANSLATE list is not enough and the reason is easy to miss: CP1253 round-trips more
-- than Latin letters. The typographic apostrophe, the em dash, the ellipsis, the degree sign and
-- the whole Greek block all survive the fold, so « L''École du Cloud » -- with the apostrophe
-- macOS substitutes by default -- would have backfilled to « l''ecole-du-cloud ». That value is
-- refused by isValidSlug on both sides, which would then block every save of that community
-- until someone retyped the slug by hand. The seeded corpus is clean, so no test would have
-- caught it.
--
-- PATINDEX under a binary collation, without which the class [^a-z0-9-] would consider « É » to
-- be a letter and leave it in place. One pass per offending character, over a table of tens of
-- rows.
WHILE EXISTS (SELECT 1 FROM #slug WHERE PATINDEX(''%[^a-z0-9-]%'', s COLLATE Latin1_General_BIN2) > 0)
  UPDATE #slug
     SET s = STUFF(s, PATINDEX(''%[^a-z0-9-]%'', s COLLATE Latin1_General_BIN2), 1, N''-'')
   WHERE PATINDEX(''%[^a-z0-9-]%'', s COLLATE Latin1_General_BIN2) > 0;

WITH collapsed AS (
  -- Six passes: each halves a run of separators, so up to 64 consecutive ones collapse to one.
  SELECT Id, Name, REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    s, N''--'', N''-''), N''--'', N''-''), N''--'', N''-''),
       N''--'', N''-''), N''--'', N''-''), N''--'', N''-'') AS s
  FROM #slug
),
trimmed AS (
  SELECT Id, Name, TRIM(N''-'' FROM s) AS s FROM collapsed
),
cut AS (
  -- Truncated at 60 on a word boundary: cut, then back off to the last separator, so a slug is
  -- never chopped mid-word.
  SELECT Id, Name,
    CASE
      WHEN LEN(s) <= 60 THEN s
      WHEN CHARINDEX(N''-'', REVERSE(LEFT(s, 60))) = 0 THEN LEFT(s, 60)
      ELSE LEFT(s, 60 - CHARINDEX(N''-'', REVERSE(LEFT(s, 60))))
    END AS s
  FROM trimmed
),
base AS (
  -- Never empty. A name made only of ideograms or symbols falls back to its identifier, which
  -- is stable and unique without a lookup.
  SELECT Id, Name,
    COALESCE(
      NULLIF(TRIM(N''-'' FROM s), N''''),
      N''communaute-'' + LOWER(LEFT(REPLACE(CONVERT(CHAR(36), Id), N''-'', N''''), 8))
    ) AS s
  FROM cut
),
numbered AS (
  -- Two names that reduce to the same slug are separated without failing, deterministically.
  SELECT Id, s, ROW_NUMBER() OVER (PARTITION BY s ORDER BY Name, Id) AS rn FROM base
)
UPDATE c
   SET c.Slug = CASE WHEN n.rn = 1 THEN n.s ELSE n.s + N''-'' + CAST(n.rn AS NVARCHAR(10)) END
  FROM dbo.Community AS c
  JOIN numbered AS n ON n.Id = c.Id;

DROP TABLE #slug;
');

-- NOT NULL only once every row has one, which is what makes the backfill above mandatory
-- rather than a convenience.
EXEC(N'ALTER TABLE dbo.Community ALTER COLUMN Slug NVARCHAR(80) NOT NULL;');

-- Uniqueness is the database''s, not the code''s: #166 asks for it explicitly, and a
-- read-then-insert can always be overtaken. The API reads error 2601/2627 and turns it into a
-- refusal that names the community already holding the slug.
EXEC(N'CREATE UNIQUE INDEX UX_Community_Slug ON dbo.Community (Slug);');
