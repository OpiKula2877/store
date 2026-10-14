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

Po pushi GitHub Action web přestaví a stránka appky se objeví i v `sitemap-index.xml`.

## Jak co funguje

- **Releases**: tlačítko „Stáhnout“ podle zařízení návštěvníka vybere správný soubor (`.exe`/`.msi` → Windows, `.apk` → Android, `.dmg` → macOS, `.AppImage`/`.deb` → Linux). Ostatní soubory a starší verze jsou ve výběru verzí; odkaz na konkrétní verzi: `/app/<appka>/?v=v1.2.0`.
- **Filtr** na úvodní stránce má dvě skupiny: **Android** a **PC** (Windows, Linux, macOS).
- **Podpora**: na detailu aplikace je u zvolené verze přehled Android / Windows / Linux / macOS. Platforma je podporovaná, pokud má verze v releases soubor pro ni.
- **Screenshoty** se berou z obrázků v README (bez badge odznaků).
- **Popis** se bere z pole „About“ repozitáře na GitHubu.
- Data se načítají přímo v prohlížeči z GitHub API a ukládají se na 10 minut do `localStorage` (anonymní limit je 60 požadavků/h na IP).

## Vývoj

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # výstup v dist/
```
