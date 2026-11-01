# UK Data Checker

A website that shows official UK statistics clearly, with the source, date and definition next to every number, so people can check claims before believing or sharing them.

## What it does

| Page | What you get | Where the data comes from |
|---|---|---|
| **Home** | 8 live headline figures (inflation, unemployment, GDP, pay growth, claimant count, debt…) | ONS time series API, live |
| **Map** | Every UK council area coloured by any of 25 measures: jobs and pay, 12 DWP benefits (Universal Credit, PIP, Housing Benefit, State Pension, Pension Credit, Attendance Allowance, DLA, Carer's Allowance, ESA, JSA, children in low-income families) and immigration (net migration, arrivals, departures, supported asylum seekers incl. contingency/hotel housing, Homes for Ukraine, Afghan resettlement, NI numbers to overseas nationals, % born abroad). Switch between numbers and per 1,000 people. Click an area for all its figures and ranks | ONS boundaries, Nomis, DWP Stat-Xplore, ONS mid-year estimates, Home Office, Census 2021 |
| **Bulletins** | ONS statistical bulletins and articles, read on this site: highlighted main points, a contents sidebar, every chart redrawn as an interactive chart (with a table view and CSV download), tidy tables, and links to series and other bulletins kept on-site. Shows release date, next release, and whether it's the latest release. Every bulletin has a **quick summary** (at the top of the report, and a "Quick summary" button on each bulletin card): the ONS's own main points, word for word, cut to their first sentence, with numbers highlighted, up/down markers and tap-to-explain jargon. Nothing is reworded, so the summary can't change a figure | ONS bulletin pages and the CSV published for each chart, live |
| **Search data** | Search everything the ONS publishes. Data series open as interactive charts; bulletins, articles and datasets link to ons.gov.uk | ONS search API, live |
| **Your area** | Any of 361 council areas: claimant count and rate vs region and UK (5-year chart), population, median pay, plus the region's tax and spending | Nomis (ONS / DWP claimant count, population, ASHE pay), live |
| **Tax & spending** | Revenue raised and public spending per person for every English region and UK nation, sortable table, claimant rate by region | ONS Country and regional public sector finances |
| **Spotting fake stats** | Plain-English guide to common ways numbers mislead | — |

Every chart starts at zero, shows a hover readout, has a table view, and links back to the original source.

## Run it

Needs [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm start
```

Then open http://localhost:8000.

## Updating the tax figures

ONS publishes regional tax and spending once a year (usually May). To download the newest edition:

```bash
npm run build-data
```

This rewrites `public/data/regional-finances.json`, `public/data/local-authorities.json`, the map boundaries `public/data/la-boundaries.json` and `public/data/immigration.json` straight from the official files. The Home Office updates its immigration-by-area figures every quarter; to refresh only those, run `npm run build-data -- immigration`. No numbers are typed in by hand. Everything else on the site is fetched live.

## Optional: Universal Credit numbers from DWP

DWP publishes Universal Credit caseloads through Stat-Xplore, which needs a free API key:

1. Register at https://stat-xplore.dwp.gov.uk
2. Open your account → **Open Data API** and copy the key
3. Copy `.env.example` to `.env` and paste the key in
4. Restart `npm start`

This also turns on the 12 benefit measures and the National Insurance number measure on the map. The server downloads them in the background when it starts and keeps them in the `cache/` folder for a day, so visitors don't wait for DWP.

Area pages then show a "People on Universal Credit" section: the latest month and a point every 3 months for the last 2 years. The key stays on the server and is never sent to visitors' browsers.

Notes:
- DWP's servers are slow, so the first visit to an area takes about 10–15 seconds. After that the figures are cached for a day.
- DWP Universal Credit statistics cover Great Britain only. Northern Ireland publishes its own, so the section is hidden for NI council areas.
- DWP publishes monthly figures a few months behind (for example, May 2026 was the latest in November 2026). The site finds the newest month automatically.

## Files

- `server.js` — web server; caches requests to ONS/Nomis (ONS limits bursts of requests) and proxies DWP Stat-Xplore
- `public/` — the website (`index.html`, `css/style.css`, `js/app.js`, `js/charts.js`, `js/map.js`, `js/bulletins.js`)

The ONS switched off its JSON feed for bulletins in February 2026, so `js/bulletins.js` reads the published bulletin page and rebuilds only safe content (text, lists, tables, links) — no scripts or embeds from the page are run. If the ONS changes its page layout, this is the file to update.
- `scripts/build-finances.js` — rebuilds the regional tax data from ONS spreadsheets

## Licence of the data

Contains public sector information licensed under the Open Government Licence v3.0. This is an independent site, not run or endorsed by the ONS, DWP, HMRC or UK Government.
