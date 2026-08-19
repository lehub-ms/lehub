-- Grant the API's user-assigned managed identity access to the database.
--
-- Templated: <MI_NAME> and <MI_SID> are substituted by the infrastructure tooling,
-- which reads them from the identity itself. Applied once per environment, after the
-- database exists and before the API is deployed.
--
-- The user is created WITH SID rather than FROM EXTERNAL PROVIDER on purpose: the
-- latter makes the SQL server resolve the principal through Microsoft Graph, which
-- requires granting the server's own identity Directory.Read.All-class application
-- permissions. Passing the SID keeps that privilege ungranted. The SID is the
-- identity's client ID in little-endian byte order, hex-encoded.
--
-- db_datareader + db_datawriter only: the API never changes the schema, migrations
-- run under an Entra administrator.

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = '<MI_NAME>')
  CREATE USER [<MI_NAME>] WITH SID = <MI_SID>, TYPE = E;

IF IS_ROLEMEMBER('db_datareader', '<MI_NAME>') = 0
  ALTER ROLE db_datareader ADD MEMBER [<MI_NAME>];

IF IS_ROLEMEMBER('db_datawriter', '<MI_NAME>') = 0
  ALTER ROLE db_datawriter ADD MEMBER [<MI_NAME>];
