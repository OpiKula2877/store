# OpiKula Store

Osobní „app store“ se všemi mými aplikacemi – **https://store.opikula.dev**

Web si sám načítá z GitHubu popis, README, releases (výběr verze + soubory ke stažení), changelog a screenshoty. Je v angličtině (výchozí) a češtině (`/cs/`).

## Přidání aplikace

Do [`src/data/apps.json`](src/data/apps.json) přidej řádek s odkazem na repozitář a pushni:

```json
{ "repo": "https://github.com/OpiKula2877/NovaAppka" }
```

Volitelná pole:

| pole          | k čemu                                                                 |
| ------------- | ---------------------------------------------------------------------- |
| `name`        | zobrazovaný název (jinak název repa s mezerami místo pomlček)          |
| `description` | popis pro vyhledávače a když repo nemá „About“ popis                   |
| `icon`        | URL ikony (jinak se vygeneruje barevná ikona s iniciálami)             |
| `featured`    | `true` = zobrazí se jako první v horní poličce                         |
| `shelf`       | `false` = appka se nezobrazí v horní poličce s ikonami (v seznamu „All apps“ zůstane) |
| `platforms`   | systémy, na kterých appka běží, i když pro ně není soubor v releases (např. Linux a macOS, kde se appka sestavuje ze zdroje). Hodnoty: `windows`, `linux`, `macos`, `android` |

Po pushi GitHub Action web přestaví a stránka appky se objeví i v `sitemap-index.xml`.

## Jak co funguje

- **Releases**: tlačítko „Stáhnout“ podle zařízení návštěvníka vybere správný soubor (`.exe`/`.msi` → Windows, `.apk` → Android, `.dmg` → macOS, `.AppImage`/`.deb` → Linux). Soubor bez označení systému v názvu (např. `.zip` webové verze) se nabídne jako obecné „Stáhnout“. Ostatní soubory a starší verze jsou ve výběru verzí; odkaz na konkrétní verzi: `/app/<appka>/?v=v1.2.0`.
- **Filtr** na úvodní stránce má dvě skupiny: **Android** a **PC** (Windows, Linux, macOS).
- **Podpora**: na detailu aplikace je u zvolené verze přehled Android / Windows / Linux / macOS. Platforma je podporovaná, pokud má verze v releases soubor pro ni, nebo je uvedená v poli `platforms` (pak je označená „ze zdroje“).
- **Screenshoty** se berou z obrázků v README (bez badge odznaků).
- **Popis** se bere z pole „About“ repozitáře na GitHubu.
- Data se načítají přímo v prohlížeči z GitHub API a ukládají se na 10 minut do `localStorage` (anonymní limit je 60 požadavků/h na IP).

## Cloudflare Worker (cache pro GitHub API)

Web nevolá GitHub přímo. Volá Worker na `store-api.opikula.dev` ([`worker/`](worker/)), který odpovědi drží v cache 5 minut a používá read-only token. Návštěvníci tak nevyčerpávají anonymní limit 60 požadavků za hodinu na IP.

```bash
cd worker
npm install
npx wrangler deploy        # nasazení; přihlášení přes npx wrangler login
npx wrangler secret put GITHUB_TOKEN   # read-only token (Public repositories, bez permisí)
```

Lokálně: `npx wrangler dev` ve složce `worker` a `PUBLIC_STORE_API=http://127.0.0.1:8787/gh npm run dev`.

## Vývoj

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # výstup v dist/
```
