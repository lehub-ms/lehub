import sql from 'mssql'
import { type NamedRef } from './eventsRepo'
import { getMediaConfig, mediaUrl, type MediaConfig } from './mediaUrls'
import { getPool } from './sqlClient'

/**
 * Ce qu'un compte suit : ses communautés et ses technologies.
 *
 * Ce module est le seul à écrire `dbo.UserPreferredCommunity` et `dbo.UserPreferredTechnology`,
 * et le seul à écrire `dbo.[User].CalendarToken` — à une exception près, la purge à l'archivage
 * d'une entrée de référentiel, qui vit dans `communitiesRepo` / `technologiesRepo` parce qu'elle
 * doit partir dans le même aller-retour que le changement de statut.
 *
 * Ce lot n'est pas transactionnel, et c'est assumé : si la purge échoue après l'archivage,
 * l'entrée reste suivie par des comptes alors qu'elle n'est plus proposée. Cet état est celui
 * que #195 décrit et affiche (« entrée archivée pas encore purgée »), et l'enregistrement
 * continue de fonctionner — voir la garde de `REPLACE_PREFERENCES_QUERY`, qui tolère une entrée
 * archivée **déjà enregistrée** précisément pour ne pas transformer cette situation en impasse.
 *
 * L'invariant qui compte, et que les tests assertionnent sur le texte SQL lui-même : le jeton est
 * frappé au **premier** enregistrement et jamais aux suivants. C'est `COALESCE(CalendarToken,
 * NEWID())` qui le tient, pas une branche applicative — la promesse « aucun réabonnement
 * nécessaire » est une propriété de la persistance, pas une phrase d'interface.
 */

/** `null` veut dire « jamais enregistré », distinct d'une sélection enregistrée vide. */
export interface SavedPreferences {
  communities: NamedRef[]
  technologies: NamedRef[]
}

/** Une entrée soumise que le référentiel ne propose plus. */
export interface UnknownReference {
  id: string
  dimension: 'community' | 'technology'
}

/** Un refus est un résultat, jamais un throw — la construction que #150 a établie. */
export type ReplaceResult =
  | { ok: true; preferences: SavedPreferences }
  | { ok: false; error: 'account-not-found' }
  | { ok: false; error: 'unknown-reference'; unknown: UnknownReference[] }

interface RefRow {
  Id: string
  Name: string
  LogoPath: string | null
  Archived: number
}

interface OutcomeRow {
  Outcome: 'account-not-found' | 'unknown-reference' | 'saved'
}

interface UnknownRow {
  Id: string
  Dimension: 'community' | 'technology'
}

/**
 * Les deux sélections, lues sans le moindre filtre sur `Status`.
 *
 * Une entrée archivée mais pas encore purgée doit rester lisible : le récapitulatif du profil
 * (#195) l'affiche plutôt que de laisser un trou silencieux, et la barre (#193) doit pouvoir la
 * nommer si elle disparaît de la sélection. `Archived` voyage donc jusqu'au client, exactement
 * comme pour les rattachements d'un évènement.
 */
const SELECT_PREFERRED_REFS = `
SELECT c.Id, c.Name, c.LogoPath, CASE WHEN c.Status = 'archived' THEN 1 ELSE 0 END AS Archived
FROM dbo.UserPreferredCommunity AS p
INNER JOIN dbo.Community AS c ON c.Id = p.CommunityId
WHERE p.UserObjectId = @objectId
ORDER BY c.Name;

SELECT t.Id, t.Name, t.LogoPath, CASE WHEN t.Status = 'archived' THEN 1 ELSE 0 END AS Archived
FROM dbo.UserPreferredTechnology AS p
INNER JOIN dbo.Technology AS t ON t.Id = p.TechnologyId
WHERE p.UserObjectId = @objectId
ORDER BY t.Name;
`

/**
 * Le jeton d'abord, les deux sélections ensuite.
 *
 * Le jeton est lu et non déduit des lignes : c'est lui qui porte la distinction entre « aucune
 * préférence » et « sélection vide enregistrée », et deux tables vides ne disent pas laquelle
 * des deux.
 */
export const READ_PREFERENCES_QUERY = `
SELECT CalendarToken FROM dbo.[User] WHERE ExternalIdObjectId = @objectId;
${SELECT_PREFERRED_REFS}
`

/**
 * Le remplacement intégral, en un seul aller-retour.
 *
 * `XACT_ABORT ON` : une erreur d'exécution au milieu du lot annule tout plutôt que de laisser la
 * transaction ouverte sur une moitié d'écriture. Les deux DELETE et les deux INSERT tiennent donc
 * ensemble — c'est ce qui donne « la dernière écriture gagne, sans ligne orpheline ni état
 * intermédiaire lisible » de #191 : un lecteur concurrent attend les verrous et obtient
 * l'ensemble précédent, jamais un ensemble à moitié remplacé. Il est refermé après le commit
 * parce que c'est un réglage de **connexion**, et que la connexion est mutualisée — le
 * raisonnement complet est dans `eventsRepo`, qui a établi la convention.
 *
 * La validation précède le `BEGIN TRANSACTION` plutôt que de le suivre : rien n'est écrit puis
 * défait, donc « sans écriture partielle » ne dépend pas du rollback.
 *
 * **Une entrée archivée déjà enregistrée reste acceptée.** Refuser tout ce qui n'est pas
 * `active` paraissait naturel, mais #195 décrit et affiche l'entrée archivée pas encore purgée :
 * une fois dans la sélection, elle revient à chaque lecture, et un refus la rendrait
 * inexpugnable — plus aucun enregistrement ne passerait tant que l'utilisateur n'aurait pas tout
 * réinitialisé. La garde refuse donc l'inconnu et l'archivé *qu'on n'avait pas déjà*, ce qui
 * couvre le seul cas qu'elle vise : cocher une entrée qui vient de disparaître.
 *
 * Le compte est vérifié en premier. Un jeton parfaitement valide dont la ligne miroir n'a pas
 * encore été écrite (`me/session` jamais appelé) ferait autrement échouer les clés étrangères en
 * 500 quand la sélection est non vide, et passerait silencieusement quand elle est vide — un
 * enregistrement qui n'enregistre rien.
 */
export const REPLACE_PREFERENCES_QUERY = `
SET XACT_ABORT ON;

DECLARE @submittedCommunities TABLE (Id UNIQUEIDENTIFIER PRIMARY KEY);
DECLARE @submittedTechnologies TABLE (Id UNIQUEIDENTIFIER PRIMARY KEY);
DECLARE @unknown TABLE (Id UNIQUEIDENTIFIER, Dimension NVARCHAR(20));

INSERT INTO @submittedCommunities (Id)
SELECT DISTINCT CAST(value AS UNIQUEIDENTIFIER) FROM OPENJSON(@communityIds);

INSERT INTO @submittedTechnologies (Id)
SELECT DISTINCT CAST(value AS UNIQUEIDENTIFIER) FROM OPENJSON(@technologyIds);

INSERT INTO @unknown (Id, Dimension)
SELECT s.Id, 'community' FROM @submittedCommunities AS s
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.Community AS c
  WHERE c.Id = s.Id
    AND (c.Status = 'active'
         OR EXISTS (SELECT 1 FROM dbo.UserPreferredCommunity AS p
                    WHERE p.UserObjectId = @objectId AND p.CommunityId = s.Id))
)
UNION ALL
SELECT s.Id, 'technology' FROM @submittedTechnologies AS s
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.Technology AS t
  WHERE t.Id = s.Id
    AND (t.Status = 'active'
         OR EXISTS (SELECT 1 FROM dbo.UserPreferredTechnology AS p
                    WHERE p.UserObjectId = @objectId AND p.TechnologyId = s.Id))
);

IF NOT EXISTS (SELECT 1 FROM dbo.[User] WHERE ExternalIdObjectId = @objectId)
  SELECT 'account-not-found' AS Outcome;
ELSE IF EXISTS (SELECT 1 FROM @unknown)
BEGIN
  SELECT 'unknown-reference' AS Outcome;
  SELECT Id, Dimension FROM @unknown;
END
ELSE
BEGIN
  BEGIN TRANSACTION;

  DELETE FROM dbo.UserPreferredCommunity WHERE UserObjectId = @objectId;
  DELETE FROM dbo.UserPreferredTechnology WHERE UserObjectId = @objectId;

  INSERT INTO dbo.UserPreferredCommunity (UserObjectId, CommunityId)
  SELECT @objectId, Id FROM @submittedCommunities;

  INSERT INTO dbo.UserPreferredTechnology (UserObjectId, TechnologyId)
  SELECT @objectId, Id FROM @submittedTechnologies;

  UPDATE dbo.[User]
  SET CalendarToken = COALESCE(CalendarToken, NEWID())
  WHERE ExternalIdObjectId = @objectId;

  COMMIT TRANSACTION;
  SET XACT_ABORT OFF;

  SELECT 'saved' AS Outcome;
${SELECT_PREFERRED_REFS}
END
`

/**
 * Supprimer les préférences, c'est aussi rendre le jeton.
 *
 * Le jeton remis à `NULL` fait repasser le compte dans l'état « aucune préférence », et coupera
 * le lien d'agenda le jour où la Feature iCal le résoudra. Les deux vont ensemble : garder le
 * jeton sans sélection dirait qu'il y a quelque chose à diffuser.
 *
 * Rien ici ne rapporte si des lignes existaient. Une suppression dont l'effet est déjà obtenu est
 * une réussite — le même raisonnement que `removeOrganizer`.
 */
export const DELETE_PREFERENCES_QUERY = `
SET XACT_ABORT ON;

BEGIN TRANSACTION;

DELETE FROM dbo.UserPreferredCommunity WHERE UserObjectId = @objectId;
DELETE FROM dbo.UserPreferredTechnology WHERE UserObjectId = @objectId;

UPDATE dbo.[User] SET CalendarToken = NULL WHERE ExternalIdObjectId = @objectId;

COMMIT TRANSACTION;
SET XACT_ABORT OFF;
`

function mapRef(media: MediaConfig) {
  return (row: RefRow): NamedRef => ({
    id: row.Id,
    name: row.Name,
    logoUrl: mediaUrl(row.LogoPath, media),
    archived: row.Archived === 1,
  })
}

function mapPreferences(
  media: MediaConfig,
  communities: RefRow[] = [],
  technologies: RefRow[] = [],
): SavedPreferences {
  return {
    communities: communities.map(mapRef(media)),
    technologies: technologies.map(mapRef(media)),
  }
}

export async function readPreferences(objectId: string): Promise<SavedPreferences | null> {
  const media = getMediaConfig()
  const pool = await getPool()
  const result = await pool
    .request()
    .input('objectId', sql.UniqueIdentifier, objectId)
    .query(READ_PREFERENCES_QUERY)

  const recordsets = result.recordsets as unknown[][]
  const tokenRows = (recordsets[0] ?? []) as { CalendarToken: string | null }[]

  // Le jeton, et lui seul, décide. Un compte sans ligne miroir n'a rien enregistré non plus.
  if (!tokenRows[0]?.CalendarToken) return null

  return mapPreferences(media, (recordsets[1] ?? []) as RefRow[], (recordsets[2] ?? []) as RefRow[])
}

export async function replacePreferences(
  objectId: string,
  selection: { communityIds: string[]; technologyIds: string[] },
): Promise<ReplaceResult> {
  const media = getMediaConfig()
  const pool = await getPool()

  const result = await pool
    .request()
    .input('objectId', sql.UniqueIdentifier, objectId)
    .input('communityIds', sql.NVarChar(sql.MAX), JSON.stringify(selection.communityIds))
    .input('technologyIds', sql.NVarChar(sql.MAX), JSON.stringify(selection.technologyIds))
    .query(REPLACE_PREFERENCES_QUERY)

  const recordsets = result.recordsets as unknown[][]
  const outcome = (recordsets[0] as OutcomeRow[])[0]?.Outcome

  if (outcome === 'account-not-found') return { ok: false, error: 'account-not-found' }

  if (outcome === 'unknown-reference') {
    const rows = (recordsets[1] ?? []) as UnknownRow[]
    return {
      ok: false,
      error: 'unknown-reference',
      unknown: rows.map((row) => ({ id: row.Id, dimension: row.Dimension })),
    }
  }

  return {
    ok: true,
    preferences: mapPreferences(
      media,
      (recordsets[1] ?? []) as RefRow[],
      (recordsets[2] ?? []) as RefRow[],
    ),
  }
}

export async function deletePreferences(objectId: string): Promise<void> {
  const pool = await getPool()
  await pool
    .request()
    .input('objectId', sql.UniqueIdentifier, objectId)
    .query(DELETE_PREFERENCES_QUERY)
}
