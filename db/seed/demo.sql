SET NOCOUNT ON;

-- Demonstration data — fictitious, for local development and the dev environment only.
--
-- Never applied to an environment open to the public: db-seed.sh gates it behind an
-- explicit --demo flag. Real communities and real events are not seeded, they are
-- entered through the backoffice.
--
-- Event dates are relative to execution time, so there is always something upcoming
-- and something already past to exercise the listing. Replaying the file therefore
-- refreshes the dates of the events it owns — otherwise they would stay frozen at the
-- first seed and the whole set would drift into the past within weeks, leaving the
-- public site empty. Only the dates are updated: titles, descriptions and links are
-- left as they are, so a local edit survives.
--
-- Identifiers are fixed so the link tables stay valid across replays.
--
-- Single batch, no GO: the guard below must be able to abort the whole file.

IF NOT EXISTS (SELECT 1 FROM dbo.FormatType) OR NOT EXISTS (SELECT 1 FROM dbo.EventMode)
  THROW 50001, 'Reference data is missing. Run ./scripts/db-seed.sh <env> first, without --demo.', 1;

-- ─── Communities ─────────────────────────────────────────────────────────────

MERGE dbo.Community AS target
USING (VALUES
  ('C1C1C1C1-0000-0000-0000-000000000001', N'Azure User Group France',   NULL),
  ('C2C2C2C2-0000-0000-0000-000000000002', N'Microsoft 365 Community',   NULL),
  ('C3C3C3C3-0000-0000-0000-000000000003', N'Power Platform France',     NULL),
  ('C4C4C4C4-0000-0000-0000-000000000004', N'GitHub France',             NULL),
  ('C5C5C5C5-0000-0000-0000-000000000005', N'DevCom Lyon',               NULL),
  ('C6C6C6C6-0000-0000-0000-000000000006', N'Azure User Group Bordeaux', NULL),
  ('C7C7C7C7-0000-0000-0000-000000000007', N'Cloud Native Nantes',       NULL),
  ('C8C8C8C8-0000-0000-0000-000000000008', N'Azure User Group Toulouse', NULL),
  ('C9C9C9C9-0000-0000-0000-000000000009', N'Tech & Wine Marseille',     NULL),
  ('CACACACA-0000-0000-0000-00000000000A', N'PyData Strasbourg',         NULL),
  ('CBCBCBCB-0000-0000-0000-00000000000B', N'Women in Tech France',      NULL),
  ('CCCCCCCC-0000-0000-0000-00000000000C', N'DevFest Lille',             NULL)
) AS source (Id, Name, LogoUrl)
ON target.Id = source.Id
WHEN NOT MATCHED THEN INSERT (Id, Name, LogoUrl) VALUES (source.Id, source.Name, source.LogoUrl);

-- ─── Technologies ────────────────────────────────────────────────────────────

MERGE dbo.Technology AS target
USING (VALUES
  ('B1B1B1B1-0000-0000-0000-000000000001', N'Azure',          NULL),
  ('B2B2B2B2-0000-0000-0000-000000000002', N'.NET',           NULL),
  ('B3B3B3B3-0000-0000-0000-000000000003', N'Microsoft 365',  NULL),
  ('B4B4B4B4-0000-0000-0000-000000000004', N'Power Platform', NULL),
  ('B5B5B5B5-0000-0000-0000-000000000005', N'GitHub',         NULL),
  ('B6B6B6B6-0000-0000-0000-000000000006', N'TypeScript',     NULL),
  ('B7B7B7B7-0000-0000-0000-000000000007', N'Python',         NULL),
  ('B8B8B8B8-0000-0000-0000-000000000008', N'GitHub Copilot', NULL),
  ('B9B9B9B9-0000-0000-0000-000000000009', N'Azure OpenAI',   NULL),
  ('BABABABA-0000-0000-0000-00000000000A', N'Kubernetes',     NULL)
) AS source (Id, Name, LogoUrl)
ON target.Id = source.Id
WHEN NOT MATCHED THEN INSERT (Id, Name, LogoUrl) VALUES (source.Id, source.Name, source.LogoUrl);

-- ─── Events ──────────────────────────────────────────────────────────────────
-- Formats:  F1 Conférence · F2 Meetup · F3 Webinaire · F4 Hackathon · F5 Atelier
-- Modes:    D1 Présentiel · D2 En ligne · D3 Hybride
-- E7 and E8 are deliberately in the past, so "upcoming events" is a real filter.

MERGE dbo.Event AS target
USING (VALUES
  ('E1E1E1E1-0000-0000-0000-000000000001', N'Azure Community Day Paris',
   N'Une journée dédiée aux dernières actualités Azure avec des sessions techniques, retours d''expérience et networking.',
   DATEADD(DAY, 7, GETUTCDATE()), DATEADD(HOUR, 3, DATEADD(DAY, 7, GETUTCDATE())),
   'F1F1F1F1-0000-0000-0000-000000000001', 'D1D1D1D1-0000-0000-0000-000000000001', NULL),

  ('E2E2E2E2-0000-0000-0000-000000000002', N'Microsoft 365 Bootcamp',
   N'Formation intensive sur les outils M365 : Teams, SharePoint, Power Automate et Copilot.',
   DATEADD(DAY, 14, GETUTCDATE()), DATEADD(HOUR, 5, DATEADD(DAY, 14, GETUTCDATE())),
   'F5F5F5F5-0000-0000-0000-000000000005', 'D2D2D2D2-0000-0000-0000-000000000002', NULL),

  ('E3E3E3E3-0000-0000-0000-000000000003', N'GitHub Copilot Hackathon',
   N'24h pour construire une application assistée par IA avec GitHub Copilot. Équipes de 2 à 4 personnes.',
   DATEADD(DAY, 21, GETUTCDATE()), DATEADD(DAY, 22, GETUTCDATE()),
   'F4F4F4F4-0000-0000-0000-000000000004', 'D3D3D3D3-0000-0000-0000-000000000003', NULL),

  ('E4E4E4E4-0000-0000-0000-000000000004', N'Meetup Azure Bordeaux',
   N'Rencontre mensuelle de la communauté Azure de Bordeaux. Au programme : 2 talks de 30 min et networking.',
   DATEADD(DAY, 28, GETUTCDATE()), DATEADD(MINUTE, 150, DATEADD(DAY, 28, GETUTCDATE())),
   'F2F2F2F2-0000-0000-0000-000000000002', 'D1D1D1D1-0000-0000-0000-000000000001', NULL),

  ('E5E5E5E5-0000-0000-0000-000000000005', N'Introduction à Azure OpenAI',
   N'Webinaire de présentation des services Azure OpenAI : GPT-4, DALL·E, Whisper. Démonstrations en direct.',
   DATEADD(DAY, 35, GETUTCDATE()), DATEADD(MINUTE, 90, DATEADD(DAY, 35, GETUTCDATE())),
   'F3F3F3F3-0000-0000-0000-000000000003', 'D2D2D2D2-0000-0000-0000-000000000002', NULL),

  ('E6E6E6E6-0000-0000-0000-000000000006', N'Cloud Native Nantes',
   N'Session sur Kubernetes AKS, Dapr et les architectures cloud-native avec retour d''expérience en production.',
   DATEADD(DAY, 42, GETUTCDATE()), DATEADD(HOUR, 3, DATEADD(DAY, 42, GETUTCDATE())),
   'F2F2F2F2-0000-0000-0000-000000000002', 'D1D1D1D1-0000-0000-0000-000000000001', NULL),

  ('E7E7E7E7-0000-0000-0000-000000000007', N'Azure Meetup Toulouse',
   N'Session mensuelle de la communauté Azure de Toulouse. Talks courts et démo live sur les nouveautés Azure.',
   DATEADD(DAY, -14, GETUTCDATE()), DATEADD(MINUTE, 150, DATEADD(DAY, -14, GETUTCDATE())),
   'F2F2F2F2-0000-0000-0000-000000000002', 'D1D1D1D1-0000-0000-0000-000000000001', NULL),

  ('E8E8E8E8-0000-0000-0000-000000000008', N'Python France Conference',
   N'Deux jours de talks autour de Python : data science, backend, MLOps. Keynotes internationaux et workshops.',
   DATEADD(DAY, -7, GETUTCDATE()), DATEADD(DAY, -5, GETUTCDATE()),
   'F1F1F1F1-0000-0000-0000-000000000001', 'D3D3D3D3-0000-0000-0000-000000000003', NULL),

  ('E9E9E9E9-0000-0000-0000-000000000009', N'DevOps Day Marseille',
   N'Journée DevOps avec focus sur GitOps, SRE et observabilité. Retours d''expérience de grandes entreprises françaises.',
   DATEADD(DAY, 49, GETUTCDATE()), DATEADD(HOUR, 8, DATEADD(DAY, 49, GETUTCDATE())),
   'F1F1F1F1-0000-0000-0000-000000000001', 'D1D1D1D1-0000-0000-0000-000000000001', NULL),

  ('EAEAEAEA-0000-0000-0000-00000000000A', N'Power Platform World Tour Paris',
   N'Étape française du World Tour Power Platform : Power Apps, Power Automate, Copilot Studio et Dataverse.',
   DATEADD(DAY, 56, GETUTCDATE()), DATEADD(HOUR, 9, DATEADD(DAY, 56, GETUTCDATE())),
   'F1F1F1F1-0000-0000-0000-000000000001', 'D1D1D1D1-0000-0000-0000-000000000001', NULL),

  ('EBEBEBEB-0000-0000-0000-00000000000B', N'Women in Tech Conference',
   N'Conférence dédiée à la diversité dans la tech. Talks inspirants, ateliers carrière et sessions de mentorat.',
   DATEADD(DAY, 63, GETUTCDATE()), DATEADD(HOUR, 7, DATEADD(DAY, 63, GETUTCDATE())),
   'F1F1F1F1-0000-0000-0000-000000000001', 'D3D3D3D3-0000-0000-0000-000000000003', NULL),

  ('ECECECEC-0000-0000-0000-00000000000C', N'Kubernetes & AKS Workshop',
   N'Atelier pratique : déployer et opérer un cluster AKS en production. Prévoyez votre laptop et un abonnement Azure.',
   DATEADD(DAY, 10, GETUTCDATE()), DATEADD(HOUR, 4, DATEADD(DAY, 10, GETUTCDATE())),
   'F5F5F5F5-0000-0000-0000-000000000005', 'D2D2D2D2-0000-0000-0000-000000000002', NULL),

  ('EDEDEDED-0000-0000-0000-00000000000D', N'TypeScript Meetup Lyon',
   N'Meetup TypeScript : nouveautés 5.x, patterns avancés, et démo d''intégration avec React 19.',
   DATEADD(DAY, 17, GETUTCDATE()), DATEADD(MINUTE, 120, DATEADD(DAY, 17, GETUTCDATE())),
   'F2F2F2F2-0000-0000-0000-000000000002', 'D1D1D1D1-0000-0000-0000-000000000001', NULL),

  ('EEEEEEEE-0000-0000-0000-00000000000E', N'AI & Copilot Lunch & Learn',
   N'Pause déjeuner dédiée à GitHub Copilot et Azure OpenAI. Démos, tips et cas d''usage concrets.',
   DATEADD(DAY, 4, GETUTCDATE()), DATEADD(MINUTE, 60, DATEADD(DAY, 4, GETUTCDATE())),
   'F3F3F3F3-0000-0000-0000-000000000003', 'D2D2D2D2-0000-0000-0000-000000000002', NULL),

  ('EFEFEFEF-0000-0000-0000-00000000000F', N'DevFest Lille',
   N'Édition lilloise du DevFest : cloud, IA, web moderne. Une journée, deux tracks, 500 développeurs.',
   DATEADD(DAY, 70, GETUTCDATE()), DATEADD(HOUR, 9, DATEADD(DAY, 70, GETUTCDATE())),
   'F1F1F1F1-0000-0000-0000-000000000001', 'D1D1D1D1-0000-0000-0000-000000000001', NULL)
) AS source (Id, Title, Description, StartDate, EndDate, FormatTypeId, EventModeId, BannerImageUrl)
ON target.Id = source.Id
WHEN NOT MATCHED THEN
  INSERT (Id, Title, Description, StartDate, EndDate, FormatTypeId, EventModeId, BannerImageUrl)
  VALUES (source.Id, source.Title, source.Description, source.StartDate, source.EndDate,
          source.FormatTypeId, source.EventModeId, source.BannerImageUrl)
WHEN MATCHED THEN
  -- Dates only: see the note at the top of this file.
  UPDATE SET target.StartDate = source.StartDate,
             target.EndDate   = source.EndDate;

-- ─── Event ↔ Community ───────────────────────────────────────────────────────

MERGE dbo.EventCommunity AS target
USING (VALUES
  ('E1E1E1E1-0000-0000-0000-000000000001', 'C1C1C1C1-0000-0000-0000-000000000001'),
  ('E2E2E2E2-0000-0000-0000-000000000002', 'C2C2C2C2-0000-0000-0000-000000000002'),
  ('E2E2E2E2-0000-0000-0000-000000000002', 'C3C3C3C3-0000-0000-0000-000000000003'),
  ('E3E3E3E3-0000-0000-0000-000000000003', 'C4C4C4C4-0000-0000-0000-000000000004'),
  ('E3E3E3E3-0000-0000-0000-000000000003', 'C1C1C1C1-0000-0000-0000-000000000001'),
  ('E3E3E3E3-0000-0000-0000-000000000003', 'C5C5C5C5-0000-0000-0000-000000000005'),
  ('E4E4E4E4-0000-0000-0000-000000000004', 'C6C6C6C6-0000-0000-0000-000000000006'),
  ('E5E5E5E5-0000-0000-0000-000000000005', 'C1C1C1C1-0000-0000-0000-000000000001'),
  ('E6E6E6E6-0000-0000-0000-000000000006', 'C7C7C7C7-0000-0000-0000-000000000007'),
  ('E6E6E6E6-0000-0000-0000-000000000006', 'C1C1C1C1-0000-0000-0000-000000000001'),
  ('E7E7E7E7-0000-0000-0000-000000000007', 'C8C8C8C8-0000-0000-0000-000000000008'),
  ('E7E7E7E7-0000-0000-0000-000000000007', 'C1C1C1C1-0000-0000-0000-000000000001'),
  ('E8E8E8E8-0000-0000-0000-000000000008', 'CACACACA-0000-0000-0000-00000000000A'),
  ('E9E9E9E9-0000-0000-0000-000000000009', 'C9C9C9C9-0000-0000-0000-000000000009'),
  ('EAEAEAEA-0000-0000-0000-00000000000A', 'C3C3C3C3-0000-0000-0000-000000000003'),
  ('EBEBEBEB-0000-0000-0000-00000000000B', 'CBCBCBCB-0000-0000-0000-00000000000B'),
  ('EBEBEBEB-0000-0000-0000-00000000000B', 'C4C4C4C4-0000-0000-0000-000000000004'),
  ('ECECECEC-0000-0000-0000-00000000000C', 'C7C7C7C7-0000-0000-0000-000000000007'),
  ('ECECECEC-0000-0000-0000-00000000000C', 'C1C1C1C1-0000-0000-0000-000000000001'),
  ('EDEDEDED-0000-0000-0000-00000000000D', 'C5C5C5C5-0000-0000-0000-000000000005'),
  ('EEEEEEEE-0000-0000-0000-00000000000E', 'C4C4C4C4-0000-0000-0000-000000000004'),
  ('EFEFEFEF-0000-0000-0000-00000000000F', 'CCCCCCCC-0000-0000-0000-00000000000C')
) AS source (EventId, CommunityId)
ON target.EventId = source.EventId AND target.CommunityId = source.CommunityId
WHEN NOT MATCHED THEN INSERT (EventId, CommunityId) VALUES (source.EventId, source.CommunityId);

-- ─── Event ↔ Technology ──────────────────────────────────────────────────────

MERGE dbo.EventTechnology AS target
USING (VALUES
  ('E1E1E1E1-0000-0000-0000-000000000001', 'B1B1B1B1-0000-0000-0000-000000000001'),
  ('E1E1E1E1-0000-0000-0000-000000000001', 'B2B2B2B2-0000-0000-0000-000000000002'),
  ('E2E2E2E2-0000-0000-0000-000000000002', 'B3B3B3B3-0000-0000-0000-000000000003'),
  ('E2E2E2E2-0000-0000-0000-000000000002', 'B4B4B4B4-0000-0000-0000-000000000004'),
  ('E3E3E3E3-0000-0000-0000-000000000003', 'B5B5B5B5-0000-0000-0000-000000000005'),
  ('E3E3E3E3-0000-0000-0000-000000000003', 'B1B1B1B1-0000-0000-0000-000000000001'),
  ('E3E3E3E3-0000-0000-0000-000000000003', 'B6B6B6B6-0000-0000-0000-000000000006'),
  ('E3E3E3E3-0000-0000-0000-000000000003', 'B7B7B7B7-0000-0000-0000-000000000007'),
  ('E3E3E3E3-0000-0000-0000-000000000003', 'B8B8B8B8-0000-0000-0000-000000000008'),
  ('E5E5E5E5-0000-0000-0000-000000000005', 'B1B1B1B1-0000-0000-0000-000000000001'),
  ('E5E5E5E5-0000-0000-0000-000000000005', 'B9B9B9B9-0000-0000-0000-000000000009'),
  ('E6E6E6E6-0000-0000-0000-000000000006', 'BABABABA-0000-0000-0000-00000000000A'),
  ('E6E6E6E6-0000-0000-0000-000000000006', 'B1B1B1B1-0000-0000-0000-000000000001'),
  ('E7E7E7E7-0000-0000-0000-000000000007', 'B1B1B1B1-0000-0000-0000-000000000001'),
  ('E8E8E8E8-0000-0000-0000-000000000008', 'B7B7B7B7-0000-0000-0000-000000000007'),
  ('E9E9E9E9-0000-0000-0000-000000000009', 'B1B1B1B1-0000-0000-0000-000000000001'),
  ('E9E9E9E9-0000-0000-0000-000000000009', 'BABABABA-0000-0000-0000-00000000000A'),
  ('E9E9E9E9-0000-0000-0000-000000000009', 'B5B5B5B5-0000-0000-0000-000000000005'),
  ('EAEAEAEA-0000-0000-0000-00000000000A', 'B4B4B4B4-0000-0000-0000-000000000004'),
  ('EAEAEAEA-0000-0000-0000-00000000000A', 'B3B3B3B3-0000-0000-0000-000000000003'),
  ('EBEBEBEB-0000-0000-0000-00000000000B', 'B5B5B5B5-0000-0000-0000-000000000005'),
  ('ECECECEC-0000-0000-0000-00000000000C', 'BABABABA-0000-0000-0000-00000000000A'),
  ('ECECECEC-0000-0000-0000-00000000000C', 'B1B1B1B1-0000-0000-0000-000000000001'),
  ('EDEDEDED-0000-0000-0000-00000000000D', 'B6B6B6B6-0000-0000-0000-000000000006'),
  ('EEEEEEEE-0000-0000-0000-00000000000E', 'B8B8B8B8-0000-0000-0000-000000000008'),
  ('EEEEEEEE-0000-0000-0000-00000000000E', 'B9B9B9B9-0000-0000-0000-000000000009'),
  ('EFEFEFEF-0000-0000-0000-00000000000F', 'B1B1B1B1-0000-0000-0000-000000000001'),
  ('EFEFEFEF-0000-0000-0000-00000000000F', 'B5B5B5B5-0000-0000-0000-000000000005'),
  ('EFEFEFEF-0000-0000-0000-00000000000F', 'B6B6B6B6-0000-0000-0000-000000000006')
) AS source (EventId, TechnologyId)
ON target.EventId = source.EventId AND target.TechnologyId = source.TechnologyId
WHEN NOT MATCHED THEN INSERT (EventId, TechnologyId) VALUES (source.EventId, source.TechnologyId);
