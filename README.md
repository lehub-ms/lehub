# LeHub

**L'agenda des communautés Microsoft francophones.**

Meetups, conférences et webinaires des communautés techniques francophones, rassemblés en un
seul endroit. Les évènements sont aujourd'hui dispersés entre autant de sites, de réseaux et
de canaux qu'il existe d'associations : LeHub les centralise, et laisse chacun filtrer selon
les technologies et les communautés qui l'intéressent.

Le projet est bénévole, open source et hébergé intégralement sur Azure, sous un plafond
d'environ 25 €/mois.

- **Site public** — consultation des évènements et des communautés, sans compte.
- **Backoffice** — les organisateurs y publient les évènements de leur communauté.
- **Mon calendrier** — une URL iCal stable à brancher dans son agenda habituel *(à venir)*.

## Démarrage rapide

```bash
git clone https://github.com/lehub-ms/lehub.git && cd lehub
./scripts/dev-up.sh        # base de données, dépendances, jeu de démonstration
./scripts/dev-start.sh     # API + site public + backoffice
```

Puis <http://localhost:5173>. Prérequis, dépannage et boucle de développement :
**[docs/local-dev.md](docs/local-dev.md)**.

## Structure

| Dossier | Contenu |
|---|---|
| `infra/` | Infrastructure as Code (Bicep) |
| `db/` | Migrations et jeux de données |
| `api/` | API Azure Functions, partagée par les deux applications |
| `frontend/lehub.ms/` | Site public |
| `frontend/admin.lehub.ms/` | Backoffice |
| `docs/` | Documentation technique |
| `scripts/` | Outillage |

## Contribuer

Tout changement part d'une [issue](https://github.com/lehub-ms/lehub/issues). Les conventions
du dépôt — hiérarchie des issues, format des branches et des commits, règles de sécurité non
négociables — sont décrites dans [CLAUDE.md](CLAUDE.md).

Issues, descriptions de PR et textes d'interface sont en français ; le code, les commentaires,
la documentation technique et les messages de commit sont en anglais.

## Licence

MIT.
