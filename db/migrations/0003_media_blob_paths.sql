-- 0003_media_blob_paths
--
-- Feature #70 stores media in a public blob container instead of nowhere. The three
-- columns that were meant to hold a media reference have always been NULL, and their
-- names promised an absolute URL — which cannot be right in more than one environment at
-- a time. They now hold a blob path relative to the media container, and the API composes
-- the absolute URL from MEDIA_BASE_URL. The names say so.
--
-- Renaming rather than adding and dropping: nothing to migrate, and sp_rename keeps the
-- column's position, type and every dependent object.
--
-- A rename is not backward compatible, and the pipeline runs `database` before `api`: for
-- the couple of minutes between the two jobs, the still-running previous API selects a
-- column that no longer exists and answers 500 on /api/events and /api/communities. The
-- window is accepted rather than overlooked — an expand/contract pair would cost two
-- releases to rename three columns that are NULL in every deployed environment, and prod
-- is not deployed at all. A migration that touched populated columns would deserve the
-- other answer.

EXEC sp_rename N'dbo.Community.LogoUrl',    N'LogoPath',        N'COLUMN';
EXEC sp_rename N'dbo.Technology.LogoUrl',   N'LogoPath',        N'COLUMN';
EXEC sp_rename N'dbo.Event.BannerImageUrl', N'BannerImagePath', N'COLUMN';

-- Every row is NULL on dev and on prod, so this clears nothing there. It exists for a
-- local database where a contributor typed an absolute URL by hand to see an image: kept,
-- that value would now be concatenated onto the media base and produce a broken URL rather
-- than an obviously absent one.
--
-- Deferred through EXEC because T-SQL resolves column names for the whole batch up front,
-- and sp_rename above only runs once the batch is already compiled.
EXEC(N'UPDATE dbo.Community  SET LogoPath        = NULL WHERE LogoPath        LIKE ''http%'';');
EXEC(N'UPDATE dbo.Technology SET LogoPath        = NULL WHERE LogoPath        LIKE ''http%'';');
EXEC(N'UPDATE dbo.Event      SET BannerImagePath = NULL WHERE BannerImagePath LIKE ''http%'';');
