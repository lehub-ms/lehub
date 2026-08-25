# Database

Azure SQL in the cloud, SQL Server 2022 in a container locally. The schema is versioned
as migrations; the data is seeded separately.

```
db/
  migrations/    ordered, applied once, immutable after merge
  seed/          idempotent data sets
  bootstrap/     one-off cloud setup
```

## Migrations

Applied by `scripts/db-migrate.sh <local|dev>` in lexicographic order. The runner keeps
`dbo.__migrations` (file name, SHA-256, timestamp) and:

- never replays a file it has already applied;
- **refuses** a file whose checksum no longer matches what was recorded;
- runs each migration **and** the row that records it in one transaction, so a failure
  leaves the database untouched;
- rejects two files sharing a numeric prefix.

```bash
./scripts/db-migrate.sh local --dry-run   # list what would be applied
./scripts/db-migrate.sh local
```

### Writing a migration

Name it `NNNN_snake_case.sql`, taking the next free number.

**A merged migration is immutable.** Correcting one means adding a new migration — the
checksum check exists precisely to stop history from being rewritten under a database
that already applied it.

**No `GO`.** The runner wraps the file in a single transaction, which only works in one
batch. Two consequences:

- DML that references a column created earlier *in the same file* fails to compile, because
  T-SQL resolves column names for the whole batch up front. Defer it with `EXEC(N'...')`:

  ```sql
  ALTER TABLE dbo.Event ADD Slug NVARCHAR(200) NULL;
  EXEC(N'UPDATE dbo.Event SET Slug = LOWER(Title) WHERE Slug IS NULL');
  ```

  DDL referencing a *table* created earlier in the file is fine — that is how
  `0001_initial_schema.sql` declares its foreign keys.

- Statements that cannot run inside a transaction (`CREATE DATABASE`, `ALTER DATABASE`,
  full-text DDL) do not belong in a migration. Database creation is Bicep's job in the
  cloud, and `db-migrate.sh` handles it locally.

## Seeds

Applied by `scripts/db-seed.sh <local|dev> [--demo]`, idempotent, replayable.

| File | Content | Environments |
|---|---|---|
| `seed/reference.sql` | Event formats and participation modes — real, stable business data | local, dev, prod |
| `seed/demo.sql` | Fictitious communities, technologies and events | local, dev only |
| `seed/media/` | Community and event placeholders, plus the official technology icons | local only |

The split is deliberate: reference data must be able to reach a public environment, demo
data must never be able to.

`seed/media/` holds bytes, not SQL, and is applied by `scripts/blob-seed.sh local --demo`
rather than by `db-seed.sh`: it is uploaded to the local storage emulator, where the
directory tree is the blob container's tree. The paths `demo.sql` stores must match the files
committed there — `api/test/demoMedia.test.ts` fails if either half drifts.

The community and event files are placeholders created for the project; the technology files
are official Microsoft product icons imported from the Claude Design project, and are
trademarks rather than MIT-licensed assets. `db/seed/media/README.md` states the terms of each
— read it before adding a file. See also [docs/local-dev.md](../docs/local-dev.md).

## Bootstrap

`bootstrap/create-mi-user.sql` creates the contained database user for the API's managed
identity, granting `db_datareader` and `db_datawriter`. It is templated on `<MI_NAME>` and
`<MI_SID>` and belongs to the cloud setup, not the local loop — the script that applies it
lands with `/infra`.

It creates the user `WITH SID = ...` rather than `FROM EXTERNAL PROVIDER` on purpose: the
latter would require the SQL server's own identity to hold Microsoft Graph application
permissions, which is a privilege the project does not need to grant.
