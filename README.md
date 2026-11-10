# Supplier Trust Desk: P4, governed supplier changes

Exam project (SRH M.Sc. ACS, GenAI and SAP Fiori, November 2026). All companies, people and data are fictional.

P4 lets a company change supplier master data (name, tax number, address) safely. A requester asks for a change; the system judges the risk:

- **Low risk** (a street, house-number or postal-code fix, at most 2 fields) is applied on submit by the requester alone, checked and recorded.
- **Medium risk** (name, tax number, city, country, or a low change that escalates) waits for a data steward. Nobody can approve their own request (four-eyes).
- A low change escalates to medium when more than 2 fields change, when the supplier already had 2 applied changes in the last 30 days, or when the supplier is on payment hold.
- Only one submitted request per supplier and field at a time; a second one gets `409` (also when two arrive at the same moment).

P4's database is also the central store for the group's other apps: P2 (invoice decisions) and P3 (data issues) reach it through a narrow integration API.

## Architecture

| Piece | What it does | Configured in |
|---|---|---|
| Fiori elements apps | Five role-based apps, a launch page and a printable meeting report | `app/` |
| App Router | Front door: login, serves the apps with a role check per app folder, forwards `/odata/…` to the service | `.deploy/app-router/xs-app.json` |
| XSUAA | SAP login and roles | `xs-security.json` |
| CAP service (Node.js) | One OData V4 service per role, plus the business rules | `srv/` (rules in `srv/lib/change-rules.js`) |
| SAP HANA Cloud (HDI container) | The data | `db/` (model and seed data) |
| MTA | Build and deploy description | `mta.yaml` |

Services: `/odata/v4/requests` (Requester), `/odata/v4/approvals` (DataSteward), `/odata/v4/suppliers` (all roles), `/odata/v4/insights` (DataSteward, Auditor), `/odata/v4/config` (RuleAdmin), `/odata/v4/user` (who am I), `/odata/v4/integration` (technical client of P2/P3 only; it cannot approve anything).

## Roles and apps

| Role | App(s) |
|---|---|
| Requester | My Supplier Change Requests |
| DataSteward | Approve Supplier Changes, Supplier Change Insights, change report |
| Auditor | Supplier Change Insights, change report (read only) |
| RuleAdmin | Rules and Settings (postal-code rules, risk tiers, settings, thresholds) |
| All roles | Supplier Master Data (read only: suppliers change only through a request) |

## Run and test locally

Prerequisites: Node.js 20 or later (developed with CAP `@sap/cds` 10.2).

    npm install
    npm test          # 47 tests (API rules, roles, risk tiers, integration API)
    npx cds watch     # http://localhost:4004, SQLite in memory, mocked users

Local users (mocked, local only; the password equals the user name): `rita`, `raj` (Requester), `sam` (DataSteward), `mixa` (Requester + DataSteward, for the four-eyes test), `aud` (Auditor), `ops` (RuleAdmin), `p2app`, `p3app` (Integration), `nobody` (no role). In the cloud, XSUAA replaces them.

`test/requests.http` has example calls.

## Build and deploy to SAP BTP (Cloud Foundry)

Prerequisites: a Cloud Foundry space with entitlements for SAP HANA Cloud (`hdi-shared`) and XSUAA (`application`), a running SAP HANA Cloud instance mapped to that space, the cf CLI with the MultiApps plugin, and the Cloud MTA Build Tool (`mbt`). Developed with `@sap/approuter` 23.4.0.

    mbt build -t gen --mtar mta.tar     # npm ci, cds build --production, copies the apps for the App Router
    cf deploy gen/mta.tar -f            # the service starts only after the database step (deployed-after)

The deploy creates the role collections `Requester`, `DataSteward`, `Auditor` and `RuleAdmin` (`… (supplier-mdcr <org>-<space>)`); assign them to users in the BTP cockpit under Security → Role Collections.

Notes:

- The cloud configuration is final: do not run `cds add …` again (`cds add approuter` would rewrite `xs-app.json`).
- Seed files in `db/data` use `;` between columns: never put a `;` inside a text.
- On a trial account, SAP stops the apps and the HANA instance every day. Start the HANA instance first, then `cf start supplier-mdcr-srv` and `cf start supplier-mdcr`.

## Hosted app

https://33b56fe6trial-dev-supplier-mdcr.cfapps.us10-001.hana.ondemand.com (SAP login; a role collection is needed to see data. Reviewers: ask the team for access.)

## Security

No passwords, keys or tokens are stored in this repository. The P2/P3 service-key values are kept only in a password manager.

## AI assistance

Built with AI assistance (Claude, and SAP's AI tools in the other projects). What was generated, how it was integrated and what we changed is documented in the group's GenAI log.
