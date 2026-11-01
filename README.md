# UK Data Checker

A website that shows official UK statistics clearly, with the source, date and definition next to every number, so people can check claims before believing or sharing them.

## What it does

| Page | What you get | Where the data comes from |
|---|---|---|
| **Home** | 8 live headline figures (inflation, unemployment, GDP, pay growth, claimant count, debt…) | ONS time series API, live |
| **Map** | Every UK council area coloured by any of 25 measures: jobs and pay, 12 DWP benefits (Universal Credit, PIP, Housing Benefit, State Pension, Pension Credit, Attendance Allowance, DLA, Carer's Allowance, ESA, JSA, children in low-income families) and immigration (net migration, arrivals, departures, supported asylum seekers incl. contingency/hotel housing, Homes for Ukraine, Afghan resettlement, NI numbers to overseas nationals, % born abroad). Switch between numbers and per 1,000 people. Click an area for all its figures and ranks | ONS boundaries, Nomis, DWP Stat-Xplore, ONS mid-year estimates, Home Office, Census 2021 |
| **Map → Housing** | Average house price (with detached, semi, terraced and flat prices), annual price change and first-time buyer price for every UK council; average private rent and rent change for England and Wales | UK House Price Index (HM Land Registry, ONS, Registers of Scotland, LPS); ONS Price Index of Private Rents |
| **Food shop** | Food price inflation vs all prices (live), a basket builder with average UK prices for about 200 grocery items (now vs a year ago, remembered in your browser), the biggest price rises and falls, typical change by type of food, and the price of any item each month | ONS consumer price inflation (D7G8, D7G7, D7BU, D7BT); ONS Shopping Prices Comparison Tool average prices |
| **Fuel prices** | Average UK petrol and diesel pump prices every week since 2003, in pence at the time or in today’s money; record highs; what a litre is made of (duty, VAT, the rest); and a running-cost calculator by miles and mpg | DESNZ weekly road fuel prices; ONS CPI (D7BT) to adjust for inflation |
| **Household bills** | Typical yearly energy bill under the current Ofgem price cap (with previous period), a calculator for your own usage, average electricity and gas bills by region and payment method, average water and sewerage bills by company (5-year history), and how electricity, gas and water prices have risen since 2015 compared with inflation | Ofgem price cap; DESNZ annual domestic energy bills; water company bills (Discover Water / Ofwat); ONS consumer price indices |
| **Map → Crime** | Police recorded crime for every council area in England and Wales over the latest 12 months: all crime and 11 types (violence, sexual offences, robbery, burglary, vehicle crime, shoplifting, theft from the person, criminal damage, drugs, weapons, public order), per 1,000 people or as numbers, plus the change on a year earlier. Flags areas where the police force files crime as "unassigned" (so local figures are unreliable or undercounts) and notes that city centres have few residents but many visitors | Home Office police recorded crime open data, by Community Safety Partnership |
| **Map → MPs & constituencies** | All 650 Westminster constituencies (July 2024 boundaries), coloured by party, years as an MP, business costs ("expenses"), donations, gifts & hospitality, or funded overseas visits. Search by constituency or MP name. Click for the MP's profile: first elected, total years in the Commons, when the next election must be held, IPSA business costs by type vs the typical MP, and the latest donations, gifts and visits from the Register of Members' Financial Interests (donor addresses are not shown) | UK Parliament Members API, IPSA, Register of Members' Financial Interests API, ONS boundaries |
| **Bulletins** | ONS statistical bulletins and articles, read on this site: highlighted main points, a contents sidebar, every chart redrawn as an interactive chart (with a table view and CSV download), tidy tables, and links to series and other bulletins kept on-site. Shows release date, next release, and whether it's the latest release. Every bulletin has a **quick summary** (at the top of the report, and a "Quick summary" button on each bulletin card): the ONS's own main points, word for word, cut to their first sentence, with numbers highlighted, up/down markers and tap-to-explain jargon. Nothing is reworded, so the summary can't change a figure | ONS bulletin pages and the CSV published for each chart, live |
| **Search data** | Search everything the ONS publishes. Data series open as interactive charts; bulletins, articles and datasets link to ons.gov.uk | ONS search API, live |
| **Your area** | Any of 361 council areas: claimant count and rate vs region and UK (5-year chart), population, median pay, plus the region's tax and spending | Nomis (ONS / DWP claimant count, population, ASHE pay), live |
| **How the government spends money** | Total public spending (£bn, per person, per day, % of GDP); one big pie chart of spending by department (or by area of spending) with the full department list and a click-to-open breakdown of each; a "where would your tax go?" calculator; common claims checked (foreign aid, debt interest, pensions vs benefits, immigration, NHS); spending since 1985 in cash, after inflation and as % of GDP; spending per person by region | HM Treasury Public Expenditure Statistical Analyses (PESA) |
| **Where the money comes from** | All UK public revenue (£1,139bn in 2024-25) by source: Income Tax, VAT, National Insurance, Corporation Tax, Council Tax, business rates, fuel duty, stamp duties and every smaller tax — one big pie with a click-to-open breakdown and history for each; the biggest taxes since 1999 (cash or share of total); money in vs money out; common claims checked | ONS Country and regional public sector finances (United Kingdom revenue tables) |
| **Government debt** | Public sector net debt since 1975, shaded by Prime Minister, and how much debt rose or fell under each one — in £ and (more fairly) as a share of GDP — with context on the financial crisis and pandemic. Debt figures load live; Prime Ministers' dates come from UK Parliament and are listed in `public/js/debt.js` (update it when the Prime Minister changes) | ONS public sector finances (HF6W, HF6X); UK Parliament Members API |
| **Party budget plans** | Labour, Conservative, Reform UK, Liberal Democrats and Green side by side. Tab 1: the 2024 manifestos' own costings for 2028-29 — money found (tax rises + savings), money committed (new spending + tax cuts) and borrowing — with the IFS's verdict on each. Tab 2: announcements since (2026), clearly marked as party claims that haven't been independently costed. Figures are typed in `public/js/parties.js` (there's no API for manifestos), so update that file when parties publish new plans | ICAEW summary of the parties' 2024 costings; Institute for Fiscal Studies; party announcements and news reports (linked on each card) |
| **Party donations** | Every donation reported by UK political parties since 2001: totals by party for the last 12 months, any single year or all years; where each party's money comes from (individuals, companies, trade unions, clubs); the biggest donors (filterable by party) and largest single gifts; donations per party each year; and public funding such as Short money shown separately. Explains reporting thresholds and what the register does and doesn't show | Electoral Commission register of donations (quarterly reports) |
| **Tax & spending by region** | Revenue raised and public spending per person for every English region and UK nation, sortable table, claimant rate by region | ONS Country and regional public sector finances |
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

This rewrites `public/data/regional-finances.json`, `public/data/local-authorities.json`, the map boundaries `public/data/la-boundaries.json`, `public/data/immigration.json` and `public/data/spending.json` straight from the official files. HM Treasury publishes new PESA spending tables every July; to refresh only those, run `npm run build-data -- spending`. The ONS updates the revenue tables each May; `npm run build-data -- revenue` refreshes just those. House prices update monthly and rents monthly (`npm run build-data -- housing`); the energy price cap changes every quarter and water bills every April (`npm run build-data -- bills`). Crime figures are updated by the Home Office every quarter; refresh them with `npm run build-data -- crime` (it streams a ~50MB spreadsheet, so it takes a minute). Party donations (`public/data/donations.json`) are published by the Electoral Commission every quarter; refresh them with `npm run build-data -- donations`. Grocery prices update monthly with inflation figures (`npm run build-data -- food`) and pump prices weekly (`npm run build-data -- fuel`). MP data (`public/data/mps.json`, `public/data/pcon-boundaries.json`) changes whenever there's a by-election, a party switch or new IPSA figures; refresh it with `npm run build-data -- mps` (the MP panel always loads the newest register entries live). The Home Office updates its immigration-by-area figures every quarter; to refresh only those, run `npm run build-data -- immigration`. No official statistics are typed in by hand (the one exception is party manifesto costings, which have no data feed). Everything else on the site is fetched live.

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
