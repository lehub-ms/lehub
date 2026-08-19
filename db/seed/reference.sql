SET NOCOUNT ON;

-- Reference data — real, stable business data, applied to every environment.
--
-- Event formats and participation modes are closed vocabularies referenced by
-- dbo.Event, so they must exist before any event can be created, demo or real.
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
