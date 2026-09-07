-- 0008_user_event_preferences
--
-- Story #191. Ce qu'un compte suit : ses communautés et ses technologies, celles-là mêmes
-- qu'il coche dans les filtres de la page Évènements. Les préférences *sont* les filtres,
-- il n'y a donc rien de nouveau à modéliser qu'une sélection.
--
-- Pourquoi CalendarToken porte l'existence des préférences. Une sélection vide enregistrée
-- vaut « tous les évènements » et c'est un choix légitime, distinct de « aucune préférence
-- enregistrée ». Deux lignes absentes ne disent pas laquelle des deux : il faut un marqueur
-- hors des tables de liaison. dbo.[User].CalendarToken existe depuis 0001, héritée du legacy
-- et jamais alimentée — NULL veut dire « jamais enregistré », non-NULL « enregistré, sélection
-- éventuellement vide ». Ce n'est pas un détournement : le jeton est frappé au premier
-- enregistrement parce que c'est là que le lien d'agenda naît, et sa présence *est* le fait
-- qu'il y a quelque chose à diffuser.
--
-- Pourquoi deux tables de liaison et pas NotificationPrefsJson. Une préférence est une
-- référence à une ligne de référentiel. Dans une colonne JSON elle survivrait silencieusement
-- à la disparition de ce qu'elle désigne ; en clé étrangère elle se casse bruyamment, ce qui
-- est le comportement voulu. NotificationPrefsJson reste donc intacte et sans usage.
--
-- Pourquoi les deux cascades. Supprimer un compte emporte ses préférences : une préférence
-- sans compte ne diffuse rien. Supprimer une entrée de référentiel emporte les lignes qui la
-- désignent, et SQL Server l'accepte ici parce que chaque table n'a qu'un seul chemin de
-- cascade vers chaque table cible — ce que 0005 ne pouvait pas faire avec sa double arête vers
-- dbo.[User]. La suppression d'une entrée encore rattachée à un évènement reste refusée par
-- #155, et l'archivage purge les préférences côté API, pas ici.
--
-- No GO: the migration runner wraps this file in a single transaction, which is only
-- possible in one batch. See db/README.md.

CREATE TABLE dbo.UserPreferredCommunity (
  UserObjectId UNIQUEIDENTIFIER NOT NULL,
  CommunityId  UNIQUEIDENTIFIER NOT NULL,

  -- La clé composite est la règle d'unicité : la même communauté ne peut pas être enregistrée
  -- deux fois pour le même compte, et aucun code applicatif n'a à s'en souvenir.
  -- UserObjectId en tête parce que la lecture dominante est « les préférences de ce compte ».
  CONSTRAINT PK_UserPreferredCommunity PRIMARY KEY (UserObjectId, CommunityId),

  CONSTRAINT FK_UserPreferredCommunity_User FOREIGN KEY (UserObjectId)
      REFERENCES dbo.[User] (ExternalIdObjectId) ON DELETE CASCADE,
  CONSTRAINT FK_UserPreferredCommunity_Community FOREIGN KEY (CommunityId)
      REFERENCES dbo.Community (Id) ON DELETE CASCADE
);

CREATE TABLE dbo.UserPreferredTechnology (
  UserObjectId UNIQUEIDENTIFIER NOT NULL,
  TechnologyId UNIQUEIDENTIFIER NOT NULL,

  CONSTRAINT PK_UserPreferredTechnology PRIMARY KEY (UserObjectId, TechnologyId),

  CONSTRAINT FK_UserPreferredTechnology_User FOREIGN KEY (UserObjectId)
      REFERENCES dbo.[User] (ExternalIdObjectId) ON DELETE CASCADE,
  CONSTRAINT FK_UserPreferredTechnology_Technology FOREIGN KEY (TechnologyId)
      REFERENCES dbo.Technology (Id) ON DELETE CASCADE
);

-- La clé primaire répond « que suit ce compte » ; ces index répondent « quels comptes suivent
-- cette entrée », qui est la lecture de la purge à l'archivage (#155 vu depuis #191).
CREATE INDEX IX_UserPreferredCommunity_CommunityId
    ON dbo.UserPreferredCommunity (CommunityId);
CREATE INDEX IX_UserPreferredTechnology_TechnologyId
    ON dbo.UserPreferredTechnology (TechnologyId);

-- Le jeton devient une clé de recherche le jour où la Feature « Mon lien d'agenda iCal »
-- résoudra un abonnement à partir de lui. Une collision rendrait alors l'agenda d'un compte
-- lisible depuis le lien d'un autre : l'index la rend impossible plutôt qu'improbable. Filtré,
-- parce que les NULL sont la majorité des lignes et ne se concurrencent pas entre eux.
CREATE UNIQUE INDEX UX_User_CalendarToken
    ON dbo.[User] (CalendarToken)
    WHERE CalendarToken IS NOT NULL;
