# CLAUDE.md — comfy-renpy

## Co to je

Vizuální node-based editor pro návrh struktury Ren'Py her. Místnosti (Location), eventy, itemy a postavy jsou uzly v grafu; hrany mezi Location uzly reprezentují průchody (exity). Graf se exportuje do `.rpy` kostry s `[COMFY-START/END]` markery pro round-trip bezpečné opakované exporty.

## Stack

- **Runtime**: Node.js (žádný build krok)
- **Server**: Express (`server.js`) — API + static files
- **Frontend**: Single HTML file (`public/index.html`) — vanilla JS + LiteGraph.js 0.7.18 z CDN
- **Graf**: `comfy-graph.json` — LiteGraph serializace uložená v `gameDir` (nebo vedle `server.js`)
- **Config**: `.comfy.json` vedle `server.js` (není v repo — v .gitignore)

## Klíčové soubory

- `server.js` — celý backend: config, graf CRUD, export .rpy, scan, launch
- `public/index.html` — celý frontend: LiteGraph canvas, node definice, properties panel, modály
- `.comfy.example.json` — vzorový config
- `.gitignore` — vylučuje `node_modules/`, `.comfy.json`, `comfy-graph.json`

## API

| Method | Route | Popis |
|---|---|---|
| GET | `/api/config` | Vrátí aktuální config (`gameDir`, `renpyExe`, `port`) |
| PUT | `/api/config` | Uloží config do `.comfy.json` |
| GET | `/api/graph` | Načte `comfy-graph.json` |
| PUT | `/api/graph` | Uloží `comfy-graph.json` (auto-save z frontendu každé 2s) |
| POST | `/api/export-rpy` | Generuje `.rpy` soubory z grafu (body = `graph.serialize()`) |
| GET | `/api/scan` | Zkontroluje stav `.rpy` souborů pro každý uzel v grafu |
| POST | `/api/launch` | Spustí Ren'Py exe (detached) |

## Node typy

| Typ | Barva | Porty | Klíčové properties |
|---|---|---|---|
| `renpy/location` | Modrá | inputs: blank (auto-expands) / outputs: dynamické exity | `id`, `label`, `description`, `exits[]` |
| `renpy/event` | Oranžová | žádné | `id`, `location_id`, `trigger`, `trigger_label`, `prerequisite`, `time`, `repeatable`, `priority`, `notes` |
| `renpy/item` | Fialová | žádné | `id`, `name`, `description` |
| `renpy/character` | Teal | žádné | `id`, `name`, `voice`, `sprite_id` |

### Location exits (dynamické porty)

`syncExitSlots()` odstraní všechny výstupní sloty a znovu je přidá z `properties.exits`. Volá se vždy po editaci exitů v properties panelu a v `onConfigure()` (při načítání grafu ze souboru). Vstupní sloty (blank, bezejmenné) se spravují přes `_ensureOneBlankInput()` — vždy jeden volný slot navíc.

## Export .rpy a marker systém

Každý exportovaný soubor obsahuje `[COMFY-START/END]` bloky:

```renpy
# [COMFY-START id=kitchen kind=header]
label location_kitchen:
# [COMFY-END]

    pass  # obsah lokace — sem píše člověk

# [COMFY-START id=kitchen kind=exits]
    menu:
        "north":
            jump location_hall
    jump location_kitchen
# [COMFY-END]
```

`updateMarkerRegion(content, id, kind, newInner)` regex-nahradí existující blok, nebo ho appende. Lidský obsah mimo markery je vždy zachován.

### Výstupní adresáře

- `{gameDir}/locations/{id}.rpy` — Location uzly
- `{gameDir}/events/{id}.rpy` — Event uzly

Pokud `gameDir` není nastaven, exportuje do `{projectDir}/output/`.

## Scan

`GET /api/scan` čte aktuální `comfy-graph.json` ze serveru, pak pro každý Location/Event uzel:
- **missing** — soubor neexistuje
- **stub** — soubor existuje, marker přítomen, žádný dialog
- **written** — soubor má dialogové řádky (regex na `"`, `jump`, `menu`, `show`, atd.)
- **drift** — soubor existuje bez COMFY markeru, nebo soubor bez uzlu v grafu (orphan)

## Co NEDĚLAT

- **Žádný build step** — CDN + vanilla JS, žádný npm bundler
- **Žádná databáze** — `comfy-graph.json` je source of truth pro strukturu
- **Neparsovat .rpy hluboko** — scan hledá jen marker komentáře a pár regex vzorů
- **CLAUDE.md a README.md udržovat aktuální** při každé nové feature
