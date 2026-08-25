SET NOCOUNT ON;

-- Reference data — real, stable business data, applied to every environment.
--
-- Event formats and participation modes are closed vocabularies referenced by
-- dbo.Event, so they must exist before any event can be created, demo or real.
--
-- The technology reference belongs here for the same reason and not in demo.sql:
-- Azure, Microsoft 365 or Dynamics 365 are not fictitious, they are the subjects a
-- real event is about, and a filter has nothing to offer until they exist. Their
-- identifiers are the ones the demonstration data already links to, unchanged: the
-- move must not invalidate a single dbo.EventTechnology row.
--
-- Identifiers are fixed so that references stay valid across environments and
-- across replays. MERGE ... WHEN NOT MATCHED only inserts what is missing: a row
-- edited in place is never overwritten.

MERGE dbo.FormatType AS target
USING (VALUES
  ('F1F1F1F1-0000-0000-0000-000000000001', N'Conférence'),
  ('F2F2F2F2-0000-0000-0000-000000000002', N'Meetup'),
  ('F3F3F3F3-0000-0000-0000-000000000003', N'Webinaire'),
  ('F4F4F4F4-0000-0000-0000-000000000004', N'Hackathon'),
  ('F5F5F5F5-0000-0000-0000-000000000005', N'Atelier'),
  ('F6F6F6F6-0000-0000-0000-000000000006', N'Autre')
) AS source (Id, Name)
ON target.Id = source.Id
WHEN NOT MATCHED THEN INSERT (Id, Name) VALUES (source.Id, source.Name);

MERGE dbo.EventMode AS target
USING (VALUES
  ('D1D1D1D1-0000-0000-0000-000000000001', N'Présentiel'),
  ('D2D2D2D2-0000-0000-0000-000000000002', N'En ligne'),
  ('D3D3D3D3-0000-0000-0000-000000000003', N'Hybride')
) AS source (Id, Name)
ON target.Id = source.Id
WHEN NOT MATCHED THEN INSERT (Id, Name) VALUES (source.Id, source.Name);

-- ─── Technologies ────────────────────────────────────────────────────────────

-- Those carrying a logo are the Microsoft products the Claude Design project holds an
-- official icon for, and they keep its names — `Copilot` is the Microsoft product,
-- distinct from the `GitHub Copilot` below. The others have no official icon in the
-- design project and stay NULL, which is also what keeps the neutral avatar exercised.
--
-- The bytes behind these paths reach the media container of every environment through
-- ./scripts/blob-seed.sh, which treats db/seed/media/technologies as reference media on
-- the same terms as this block. A path here without its file there is caught by
-- api/test/seedMedia.test.ts before it can become a broken image.

MERGE dbo.Technology AS target
USING (VALUES
  ('B1B1B1B1-0000-0000-0000-000000000001', N'Azure',            N'technologies/azure.svg'),
  ('B2B2B2B2-0000-0000-0000-000000000002', N'.NET',             NULL),
  ('B3B3B3B3-0000-0000-0000-000000000003', N'Microsoft 365',    N'technologies/microsoft-365.svg'),
  ('B4B4B4B4-0000-0000-0000-000000000004', N'Power Platform',   N'technologies/power-platform.svg'),
  ('B5B5B5B5-0000-0000-0000-000000000005', N'GitHub',           NULL),
  ('B6B6B6B6-0000-0000-0000-000000000006', N'TypeScript',       NULL),
  ('B7B7B7B7-0000-0000-0000-000000000007', N'Python',           NULL),
  ('B8B8B8B8-0000-0000-0000-000000000008', N'GitHub Copilot',   NULL),
  ('B9B9B9B9-0000-0000-0000-000000000009', N'Azure OpenAI',     NULL),
  ('BABABABA-0000-0000-0000-00000000000A', N'Kubernetes',       NULL),
  ('BBBBBBBB-0000-0000-0000-00000000000B', N'Copilot',          N'technologies/copilot.svg'),
  ('BCBCBCBC-0000-0000-0000-00000000000C', N'Dynamics 365',     N'technologies/dynamics-365.svg'),
  ('BDBDBDBD-0000-0000-0000-00000000000D', N'Microsoft Fabric', N'technologies/microsoft-fabric.svg')
) AS source (Id, Name, LogoPath)
ON target.Id = source.Id
-- Backfills LogoPath on an environment seeded before the icons existed. Bounded to
-- IS NULL, so it completes what is missing and never overwrites a path edited in place
-- — the rule the two MERGEs above hold by having no WHEN MATCHED clause at all. The
-- consequence is assumed: changing the icon of an already-deployed technology is a
-- migration, not a seed edit. See db/seed/media/README.md.
WHEN MATCHED AND target.LogoPath IS NULL THEN
  UPDATE SET LogoPath = source.LogoPath
WHEN NOT MATCHED THEN INSERT (Id, Name, LogoPath) VALUES (source.Id, source.Name, source.LogoPath);

-- Nothing is ever deleted here. A technology dropped from this block keeps its row, and
-- FK_EventTechnology_Technology has no cascade, so the database refuses to remove one an
-- event still references — which is the behaviour wanted, not an obstacle to work around.
