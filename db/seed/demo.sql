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
-- Media are stored as blob paths relative to the media container, and the bytes live
-- in db/seed/media/{communities,events}, uploaded to the local emulator by
-- ./scripts/blob-seed.sh local --demo and never anywhere else. Only part of the rows
-- carry one: the rest stay NULL so the colour fallbacks keep being exercised locally,
-- since that is what dev and prod actually show.
--
-- The technologies these events link to are reference data and live in reference.sql,
-- with the icons the design project publishes. The guard below refuses to run without
-- them, since every EventTechnology row here points at one.
--
-- Single batch, no GO: the guard below must be able to abort the whole file.

IF NOT EXISTS (SELECT 1 FROM dbo.FormatType)
   OR NOT EXISTS (SELECT 1 FROM dbo.EventMode)
   OR NOT EXISTS (SELECT 1 FROM dbo.Technology)
  THROW 50001, 'Reference data is missing. Run ./scripts/db-seed.sh <env> first, without --demo.', 1;

-- ─── Communities ─────────────────────────────────────────────────────────────

MERGE dbo.Community AS target
USING (VALUES
  ('C1C1C1C1-0000-0000-0000-000000000001', N'Azure User Group France',   N'communities/azure-user-group-france.svg',
   N'L''écosystème Azure au cœur de vos projets cloud, IA et DevOps — formations, meetups et retours d''expérience.'),
  ('C2C2C2C2-0000-0000-0000-000000000002', N'Microsoft 365 Community',   NULL,
   N'Maîtrisez Teams, SharePoint, Power Automate et Copilot avec une communauté francophone active et passionnée.'),
  ('C3C3C3C3-0000-0000-0000-000000000003', N'Power Platform France',     N'communities/power-platform-france.svg',
   N'Power Apps, Power BI, Power Automate, Power Virtual Agents — des solutions low-code au service de tous.'),
  ('C4C4C4C4-0000-0000-0000-000000000004', N'GitHub France',             NULL,
   N'Collaboration, open source et GitHub Copilot — rejoignez la communauté française des développeurs GitHub.'),
  ('C5C5C5C5-0000-0000-0000-000000000005', N'DevCom Lyon',               N'communities/devcom-lyon.svg',
   N'La communauté tech lyonnaise — meetups, conférences et afterworks à Lyon et en Auvergne-Rhône-Alpes.'),
  ('C6C6C6C6-0000-0000-0000-000000000006', N'Azure User Group Bordeaux', NULL,
   N'Le rendez-vous mensuel des passionnés Azure en Gironde — cloud, infra et bonnes pratiques.'),
  ('C7C7C7C7-0000-0000-0000-000000000007', N'Cloud Native Nantes',       N'communities/cloud-native-nantes.svg',
   N'Kubernetes, conteneurs et architectures cloud native, décryptés par la communauté nantaise.'),
  ('C8C8C8C8-0000-0000-0000-000000000008', N'Azure User Group Toulouse', NULL,
   N'Retours d''expérience et sessions techniques Azure, portés par l''écosystème tech toulousain.'),
  ('C9C9C9C9-0000-0000-0000-000000000009', N'Tech & Wine Marseille',     NULL,
   N'Des rencontres tech conviviales sur la Canebière, entre découvertes techniques et dégustation.'),
  ('CACACACA-0000-0000-0000-00000000000A', N'PyData Strasbourg',         NULL,
   N'Data science et machine learning en Python, pour la communauté data strasbourgeoise.'),
  ('CBCBCBCB-0000-0000-0000-00000000000B', N'Women in Tech France',      N'communities/women-in-tech-france.svg',
   N'Un réseau national pour faire avancer la place des femmes dans la tech, meetups et mentorat.'),
  ('CCCCCCCC-0000-0000-0000-00000000000C', N'DevFest Lille',             NULL,
   N'La conférence développeurs annuelle du Nord — talks, ateliers et networking.')
) AS source (Id, Name, LogoPath, Description)
ON target.Id = source.Id
-- Backfills Description on communities seeded before it existed (migration 0002) and
-- LogoPath on those seeded before the local media existed. COALESCE keeps a value
-- already in place, so a local edit still survives a replay; a single WHEN MATCHED
-- clause is required because MERGE applies only the first one that matches a row.
WHEN MATCHED AND (target.Description IS NULL OR target.LogoPath IS NULL) THEN
  UPDATE SET Description = COALESCE(target.Description, source.Description),
             LogoPath    = COALESCE(target.LogoPath,    source.LogoPath)
WHEN NOT MATCHED THEN
  INSERT (Id, Name, LogoPath, Description)
  VALUES (source.Id, source.Name, source.LogoPath, source.Description);

-- ─── Events ──────────────────────────────────────────────────────────────────
-- Formats:  F1 Conférence · F2 Meetup · F3 Webinaire · F4 Hackathon · F5 Atelier
-- Modes:    D1 Présentiel · D2 En ligne · D3 Hybride
-- E7 and E8 are deliberately in the past, so "upcoming events" is a real filter.

MERGE dbo.Event AS target
USING (VALUES
  ('E1E1E1E1-0000-0000-0000-000000000001', N'Azure Community Day Paris',
   N'Une journée dédiée aux dernières actualités Azure avec des sessions techniques, retours d''expérience et networking.',
   DATEADD(DAY, 7, GETUTCDATE()), DATEADD(HOUR, 3, DATEADD(DAY, 7, GETUTCDATE())),
   'F1F1F1F1-0000-0000-0000-000000000001', 'D1D1D1D1-0000-0000-0000-000000000001',
   N'events/azure-community-day-paris.svg'),

  ('E2E2E2E2-0000-0000-0000-000000000002', N'Microsoft 365 Bootcamp',
   N'Formation intensive sur les outils M365 : Teams, SharePoint, Power Automate et Copilot.',
   DATEADD(DAY, 14, GETUTCDATE()), DATEADD(HOUR, 5, DATEADD(DAY, 14, GETUTCDATE())),
   'F5F5F5F5-0000-0000-0000-000000000005', 'D2D2D2D2-0000-0000-0000-000000000002', NULL),

  ('E3E3E3E3-0000-0000-0000-000000000003', N'GitHub Copilot Hackathon',
   N'24h pour construire une application assistée par IA avec GitHub Copilot. Équipes de 2 à 4 personnes.',
   DATEADD(DAY, 21, GETUTCDATE()), DATEADD(DAY, 22, GETUTCDATE()),
   'F4F4F4F4-0000-0000-0000-000000000004', 'D3D3D3D3-0000-0000-0000-000000000003',
   N'events/github-copilot-hackathon.svg'),

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
   'F1F1F1F1-0000-0000-0000-000000000001', 'D1D1D1D1-0000-0000-0000-000000000001',
   N'events/power-platform-world-tour-paris.svg'),

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
   'F1F1F1F1-0000-0000-0000-000000000001', 'D1D1D1D1-0000-0000-0000-000000000001',
   N'events/devfest-lille.svg')
) AS source (Id, Title, Description, StartDate, EndDate, FormatTypeId, EventModeId, BannerImagePath)
ON target.Id = source.Id
WHEN NOT MATCHED THEN
  INSERT (Id, Title, Description, StartDate, EndDate, FormatTypeId, EventModeId, BannerImagePath)
  VALUES (source.Id, source.Title, source.Description, source.StartDate, source.EndDate,
          source.FormatTypeId, source.EventModeId, source.BannerImagePath)
WHEN MATCHED THEN
  -- Dates, plus a BannerImagePath backfill for events seeded before the local media
  -- existed: see the note at the top of this file. COALESCE leaves a path already in
  -- place alone, so a local edit survives a replay.
  UPDATE SET target.StartDate       = source.StartDate,
             target.EndDate         = source.EndDate,
             target.BannerImagePath = COALESCE(target.BannerImagePath, source.BannerImagePath);

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
  ('EFEFEFEF-0000-0000-0000-00000000000F', 'B6B6B6B6-0000-0000-0000-000000000006'),
  -- Copilot, Dynamics 365 and Microsoft Fabric, paired as the design project pairs
  -- them on the events the two data sets have in common.
  ('E1E1E1E1-0000-0000-0000-000000000001', 'BBBBBBBB-0000-0000-0000-00000000000B'),
  ('E2E2E2E2-0000-0000-0000-000000000002', 'BBBBBBBB-0000-0000-0000-00000000000B'),
  ('E3E3E3E3-0000-0000-0000-000000000003', 'BDBDBDBD-0000-0000-0000-00000000000D'),
  ('E4E4E4E4-0000-0000-0000-000000000004', 'B1B1B1B1-0000-0000-0000-000000000001'),
  ('E4E4E4E4-0000-0000-0000-000000000004', 'BDBDBDBD-0000-0000-0000-00000000000D'),
  ('E5E5E5E5-0000-0000-0000-000000000005', 'BBBBBBBB-0000-0000-0000-00000000000B'),
  ('E6E6E6E6-0000-0000-0000-000000000006', 'BCBCBCBC-0000-0000-0000-00000000000C'),
  ('EAEAEAEA-0000-0000-0000-00000000000A', 'BCBCBCBC-0000-0000-0000-00000000000C'),
  ('EEEEEEEE-0000-0000-0000-00000000000E', 'BBBBBBBB-0000-0000-0000-00000000000B')
) AS source (EventId, TechnologyId)
ON target.EventId = source.EventId AND target.TechnologyId = source.TechnologyId
WHEN NOT MATCHED THEN INSERT (EventId, TechnologyId) VALUES (source.EventId, source.TechnologyId);

-- ─── Fictitious accounts ─────────────────────────────────────────────────────
--
-- dbo.[User] is normally written only by a real sign-in, which is exactly why the
-- organiser lists of the local backoffice would otherwise always be empty: there is
-- nobody to designate. These six accounts exist so those screens have something to
-- show, and so the "organiser" persona can be exercised without six real tenant
-- accounts.
--
-- The addresses are under .invalid (RFC 2606), a top-level domain that can never be
-- registered: none of them can ever reach a real person, and none can collide with a
-- contributor's own mirrored row. No sign-in can ever match them either — there is no
-- tenant account behind these object identifiers, which is the point.

MERGE dbo.[User] AS target
USING (VALUES
  ('A1A1A1A1-0000-0000-0000-000000000001', N'amelie.rousseau@lehub.invalid',  N'Amélie',  N'Rousseau'),
  ('A2A2A2A2-0000-0000-0000-000000000002', N'karim.benali@lehub.invalid',     N'Karim',   N'Benali'),
  ('A3A3A3A3-0000-0000-0000-000000000003', N'sophie.lemoine@lehub.invalid',   N'Sophie',  N'Lemoine'),
  ('A4A4A4A4-0000-0000-0000-000000000004', N'julien.marchand@lehub.invalid',  N'Julien',  N'Marchand'),
  ('A5A5A5A5-0000-0000-0000-000000000005', N'lea.fontaine@lehub.invalid',     N'Léa',     N'Fontaine'),
  ('A6A6A6A6-0000-0000-0000-000000000006', N'claire.vasseur@lehub.invalid',   N'Claire',  N'Vasseur')
) AS source (ExternalIdObjectId, Email, GivenName, Surname)
ON target.ExternalIdObjectId = source.ExternalIdObjectId
-- No WHEN MATCHED: a name edited locally survives a replay, as everywhere else in this file.
WHEN NOT MATCHED THEN
  INSERT (ExternalIdObjectId, Email, GivenName, Surname, PrimaryAuthMethod, LastAuthMethod)
  VALUES (source.ExternalIdObjectId, source.Email, source.GivenName, source.Surname, 'email', 'email');

-- ─── Organisers ──────────────────────────────────────────────────────────────
--
-- Deliberately uneven, because the three shapes have to be exercised locally: Amélie
-- and Julien each organise two communities, so the community picker has something to
-- pick from; C1 has two organisers, so a designation can be removed without emptying
-- the community; and five communities have none at all, which is a normal state — they
-- stay manageable by the global administrators.
--
-- DesignatedBy stays NULL: nobody designated these, the seed did. That is the case the
-- column is nullable for.

MERGE dbo.CommunityOrganizer AS target
USING (VALUES
  ('C1C1C1C1-0000-0000-0000-000000000001', 'A1A1A1A1-0000-0000-0000-000000000001'),
  ('C1C1C1C1-0000-0000-0000-000000000001', 'A2A2A2A2-0000-0000-0000-000000000002'),
  ('C6C6C6C6-0000-0000-0000-000000000006', 'A1A1A1A1-0000-0000-0000-000000000001'),
  ('C3C3C3C3-0000-0000-0000-000000000003', 'A3A3A3A3-0000-0000-0000-000000000003'),
  ('C5C5C5C5-0000-0000-0000-000000000005', 'A4A4A4A4-0000-0000-0000-000000000004'),
  ('C7C7C7C7-0000-0000-0000-000000000007', 'A4A4A4A4-0000-0000-0000-000000000004'),
  ('C2C2C2C2-0000-0000-0000-000000000002', 'A5A5A5A5-0000-0000-0000-000000000005'),
  ('CBCBCBCB-0000-0000-0000-00000000000B', 'A6A6A6A6-0000-0000-0000-000000000006')
) AS source (CommunityId, UserObjectId)
ON target.CommunityId = source.CommunityId AND target.UserObjectId = source.UserObjectId
WHEN NOT MATCHED THEN
  INSERT (CommunityId, UserObjectId) VALUES (source.CommunityId, source.UserObjectId);
