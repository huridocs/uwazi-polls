# uwazi-polls

Poll **admin** and **player** as [Uwazi Pages](https://docs.uwazi.io/) (HTML/CSS/JS), plus Playwright regression tests.

This is **not** part of the Uwazi core repo. Publish the page sources to any Uwazi instance that has the `[Poll]*` templates (Configuration → Create the template structure in the admin page, or `yarn seed:schema`).

## Layout

```
admin/          # Poll admin page sources
player/         # Poll player page sources
scripts/        # seed + CI helpers
docker/         # compose stack for disposable Uwazi
tests/e2e/      # Playwright
```

## Environment

Copy `.env.example` → `.env` (or let `yarn seed` / CI write paths for you).

| Variable | Purpose | Default |
| --- | --- | --- |
| `POLL_BASE_URL` | Uwazi origin | `http://localhost:3000` |
| `POLL_USERNAME` / `POLL_PASSWORD` | Login for seed + tests | `admin` / `change this password now` |
| `POLL_ADMIN_PATH` | Admin page path | set by `yarn seed:pages` |
| `POLL_PLAYER_PATH` | Player page path | set by `yarn seed:pages` |

Player links need `?poll=<pollSharedId>&token=<sessionToken>` (from Poll admin → Sessions).

## Local development (existing Uwazi)

1. Run Uwazi locally with Mongo, Elasticsearch, Redis, and Postgres (dual-store).
2. Install and seed:

```bash
cp .env.example .env
yarn install
npx playwright install chromium
yarn seed          # [Poll]* schema + publish admin/player pages
yarn test
```

`yarn seed` runs `seed:schema` then `seed:pages`, writes `pages.local.json`, and refreshes `.env` with page paths.

Useful pieces:

```bash
yarn seed:schema   # templates / thesauri only
yarn seed:pages    # publish admin/ + player/ Pages
yarn test:ui       # Playwright UI mode
yarn test:headed   # headed Chromium
```

## Dockerized Uwazi (same path as CI)

```bash
yarn ci:up         # compose deps + official uwazi.tgz + blank-state + PG migrate + seed
yarn test
yarn ci:down
```

Requires Docker, Node 20+, curl, and enough RAM for Elasticsearch (~1GB+).

`scripts/ci-up.sh` roughly:

1. `docker compose` — Mongo, Elasticsearch, Redis, Postgres
2. Download/extract the published Uwazi release into `.uwazi/latest`
3. `yarn blank-state` (Mongo) then `yarn migrate --new` (Postgres schema)
4. Start the server, wait until HTTP responds
5. `yarn seed` against that instance (writes `.env.ci`)

## SurveyMonkey import / export

Poll admin can **Import** from SurveyMonkey (API or pasted JSON) and **Export** a poll as SurveyMonkey-compatible JSON.

The JSON shape is SurveyMonkey’s  
[`GET /v3/surveys/{id}/details`](https://developer.surveymonkey.com/api/v3/#surveys-id-details)  
response (we only need structure fields):

```json
{
  "title": "My survey",
  "id": "optional-survey-id",
  "pages": [
    {
      "id": "page1",
      "title": "Section title",
      "questions": [
        {
          "id": "q1",
          "family": "single_choice",
          "subtype": "vertical",
          "headings": [{ "heading": "Pick one" }],
          "answers": {
            "choices": [
              { "id": "c1", "text": "Yes" },
              { "id": "c2", "text": "No" }
            ]
          }
        },
        {
          "id": "q2",
          "family": "open_ended",
          "subtype": "essay",
          "headings": [{ "heading": "Comments" }]
        },
        {
          "id": "q3",
          "family": "presentation",
          "subtype": "descriptive_text",
          "headings": [{ "heading": "Instructions text" }]
        }
      ]
    }
  ]
}
```

### Type mapping

| SurveyMonkey `family` / `subtype` | Poll type |
| --- | --- |
| `presentation` (any) | Instructions |
| `single_choice` | Choice (single) |
| `multiple_choice` | Choice (multi) |
| `open_ended` + `numerical` / `numeric` | Numeric |
| `open_ended` (other) | Free text |
| anything else | Skipped on import (warned) |

Export writes the same `pages` / `questions` shape so you can re-import via **Import → JSON**. Uwazi-only fields (sessions, answers, `choice_and_text` extra prompt) are not represented in SM JSON; `choice_and_text` exports as a choice question.

Shared mapping code: [`lib/sm-details.js`](lib/sm-details.js) (concatenated into the admin page script by `yarn seed:pages`).

## Tests

```bash
yarn test:unit   # SM import/export mapping (no Uwazi)
yarn test        # Playwright e2e (needs running Uwazi / yarn ci:up)
```

Playwright specs under `tests/e2e/`:

- **smoke** — admin card + player with session
- **structure-dnd** — section / question drag-and-drop persistence
- **admin-crud** — create poll → section → question via UI
- **player-flow** — save answer (`S{n} Q{n}` title) + Accept & finish
- **session-link** — Copy link uses this instance’s Poll player path
- **import-export** — export download is SM details JSON

CI: `.github/workflows/ci.yml` on push/PR (`yarn test:unit` → `yarn ci:up` → `yarn test` → `yarn ci:down`).

## Publishing to an existing instance

Edit files under `admin/` / `player/`, then run `yarn seed:pages` against that host (`POLL_BASE_URL` / credentials in `.env`). Or paste the files into the Uwazi page editor and release manually.

## License

MIT — Copyright HURIDOCS (same as [Uwazi](https://github.com/huridocs/uwazi)).
