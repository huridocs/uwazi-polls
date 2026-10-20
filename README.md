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

## Local development

1. Run Uwazi locally (or use the docker helper below).
2. Install and seed:

```bash
cp .env.example .env
yarn install
npx playwright install chromium
yarn seed          # creates [Poll]* schema + publishes admin/player pages
yarn test
```

`yarn seed` writes `pages.local.json` and refreshes `.env` with the page paths.

### Dockerized Uwazi (same path as CI)

```bash
yarn ci:up         # compose deps + official uwazi.tgz + seed
yarn test
yarn ci:down
```

Requires Docker, Node 20+, curl, and enough RAM for Elasticsearch (~1GB+).

## Publishing to an existing instance

Edit files under `admin/` / `player/`, then run `yarn seed:pages` against that host (`POLL_BASE_URL` / credentials in `.env`). Or paste the files into the Uwazi page editor and release manually.

## License

MIT — Copyright HURIDOCS (same as [Uwazi](https://github.com/huridocs/uwazi)).
