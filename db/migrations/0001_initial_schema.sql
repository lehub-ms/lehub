-- 0001_initial_schema
--
-- Initial LeHub model: the event catalogue (reference tables, events, and the
-- many-to-many links to communities and technologies) plus the user account that
-- Epic #2 "Mon calendrier LeHub" builds on.
--
-- No GO: the migration runner wraps this file in a single transaction, which is
-- only possible in one batch. See db/README.md.

-- ─── Reference tables ────────────────────────────────────────────────────────

CREATE TABLE dbo.FormatType (
  Id   UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_FormatType_Id DEFAULT NEWSEQUENTIALID(),
  Name NVARCHAR(100)    NOT NULL,
  CONSTRAINT PK_FormatType PRIMARY KEY (Id)
);

CREATE TABLE dbo.EventMode (
  Id   UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_EventMode_Id DEFAULT NEWSEQUENTIALID(),
  Name NVARCHAR(100)    NOT NULL,
  CONSTRAINT PK_EventMode PRIMARY KEY (Id)
);

CREATE TABLE dbo.Community (
  Id      UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Community_Id DEFAULT NEWSEQUENTIALID(),
  Name    NVARCHAR(200)    NOT NULL,
  LogoUrl NVARCHAR(500)    NULL,
  CONSTRAINT PK_Community PRIMARY KEY (Id)
);

CREATE TABLE dbo.Technology (
  Id      UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Technology_Id DEFAULT NEWSEQUENTIALID(),
  Name    NVARCHAR(200)    NOT NULL,
  LogoUrl NVARCHAR(500)    NULL,
  CONSTRAINT PK_Technology PRIMARY KEY (Id)
);

-- ─── Events ──────────────────────────────────────────────────────────────────

CREATE TABLE dbo.Event (
  Id             UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Event_Id DEFAULT NEWSEQUENTIALID(),
  Title          NVARCHAR(300)    NOT NULL,
  Description    NVARCHAR(MAX)    NULL,
  StartDate      DATETIME2        NOT NULL,
  EndDate        DATETIME2        NOT NULL,
  FormatTypeId   UNIQUEIDENTIFIER NOT NULL,
  EventModeId    UNIQUEIDENTIFIER NOT NULL,
  BannerImageUrl NVARCHAR(500)    NULL,
  CONSTRAINT PK_Event            PRIMARY KEY (Id),
  CONSTRAINT FK_Event_FormatType FOREIGN KEY (FormatTypeId) REFERENCES dbo.FormatType (Id),
  CONSTRAINT FK_Event_EventMode  FOREIGN KEY (EventModeId)  REFERENCES dbo.EventMode (Id)
);

-- The public listing is "upcoming events, soonest first" — every read filters and
-- orders on StartDate.
CREATE INDEX IX_Event_StartDate ON dbo.Event (StartDate);

-- Deleting an event removes its links; deleting a community or a technology that is
-- still referenced is refused, so a reference row can never be dropped by accident.
CREATE TABLE dbo.EventCommunity (
  EventId     UNIQUEIDENTIFIER NOT NULL,
  CommunityId UNIQUEIDENTIFIER NOT NULL,
  CONSTRAINT PK_EventCommunity           PRIMARY KEY (EventId, CommunityId),
  CONSTRAINT FK_EventCommunity_Event     FOREIGN KEY (EventId)     REFERENCES dbo.Event (Id) ON DELETE CASCADE,
  CONSTRAINT FK_EventCommunity_Community FOREIGN KEY (CommunityId) REFERENCES dbo.Community (Id)
);

CREATE INDEX IX_EventCommunity_CommunityId ON dbo.EventCommunity (CommunityId);

CREATE TABLE dbo.EventTechnology (
  EventId      UNIQUEIDENTIFIER NOT NULL,
  TechnologyId UNIQUEIDENTIFIER NOT NULL,
  CONSTRAINT PK_EventTechnology            PRIMARY KEY (EventId, TechnologyId),
  CONSTRAINT FK_EventTechnology_Event      FOREIGN KEY (EventId)      REFERENCES dbo.Event (Id) ON DELETE CASCADE,
  CONSTRAINT FK_EventTechnology_Technology FOREIGN KEY (TechnologyId) REFERENCES dbo.Technology (Id)
);

CREATE INDEX IX_EventTechnology_TechnologyId ON dbo.EventTechnology (TechnologyId);

-- ─── Users ───────────────────────────────────────────────────────────────────
--
-- Keyed on the Entra External ID object identifier: LeHub never stores credentials,
-- so the identity provider's subject is the natural primary key.
--
-- PrimaryAuthMethod is the method used at first sign-in and never changes;
-- LastAuthMethod reflects the current session and is updated on every sign-in.

CREATE TABLE dbo.[User] (
  ExternalIdObjectId    UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_User PRIMARY KEY CLUSTERED,
  Email                 NVARCHAR(320)    NOT NULL,
  GivenName             NVARCHAR(100)    NOT NULL,
  Surname               NVARCHAR(100)    NOT NULL,
  PrimaryAuthMethod     NVARCHAR(20)     NOT NULL
      CONSTRAINT CK_User_PrimaryAuthMethod CHECK (PrimaryAuthMethod IN ('email', 'microsoft', 'linkedin')),
  LastAuthMethod        NVARCHAR(20)     NOT NULL
      CONSTRAINT CK_User_LastAuthMethod CHECK (LastAuthMethod IN ('email', 'microsoft', 'linkedin')),
  CreatedAt             DATETIME2(3)     NOT NULL CONSTRAINT DF_User_CreatedAt   DEFAULT SYSUTCDATETIME(),
  LastLoginAt           DATETIME2(3)     NOT NULL CONSTRAINT DF_User_LastLoginAt DEFAULT SYSUTCDATETIME(),
  Bio                   NVARCHAR(1000)   NULL,
  PreferredLanguage     NVARCHAR(10)     NULL
      CONSTRAINT CK_User_PreferredLanguage CHECK (PreferredLanguage IS NULL
                                                  OR PreferredLanguage IN ('fr-FR', 'en-US')),
  NotificationPrefsJson NVARCHAR(MAX)    NULL,
  CalendarToken         UNIQUEIDENTIFIER NULL
);

CREATE UNIQUE INDEX UX_User_Email ON dbo.[User] (Email);
