-- 0002_community_description
--
-- Story #15 (carrousel des communautés partenaires) needs a short description per
-- community alongside the existing Name and LogoUrl. NVARCHAR(300) keeps it genuinely
-- short and matches the space a carousel card has for it.

ALTER TABLE dbo.Community ADD Description NVARCHAR(300) NULL;
