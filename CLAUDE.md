# CLAUDE.md — comfy-renpy

## Co to je

Vizuální node-based editor pro návrh struktury Ren'Py her. Místnosti (Location), eventy, itemy a postavy jsou uzly v grafu; hrany mezi Location uzly reprezentují průchody (exity). Graf se exportuje do `.rpy` kostry s `[COMFY-START/END]` markery pro round-trip bezpečné opakované exporty.

## Stack

- **Runtime**: Node.js
- **Server**: Express (`server.js`) — API + static files (servíruje `dist/` v produkci)
- **Frontend**: TypeScript + Vite — entry point `index.html` + `src/main.ts`
- **Grafy**: LiteGraph.js 0.7.18 (načteno jako IIFE skript z `/lib/litegraph/`)
- **Graf data**: `comfy-graph.json` — LiteGraph serializace uložená v `gameDir` (nebo vedle `server.js`)
- **Config**: `.comfy.json` vedle `server.js` (není v repo — v .gitignore)

## Spuštění

```bash
npm run dev    # Express :3001 + Vite dev server :5173 (pro vývoj)
npm run build  # Vite build → dist/
npm start      # Jen Express :3001 (servíruje dist/)
```

## Klíčové soubory

- `server.js` — celý backend: config, graf CRUD, export .rpy, scan, validate, preview, launch
- `index.html` — Vite entry (HTML kostra, modály, toolbar HTML)
- `src/main.ts` — frontend entry point: inicializace LiteGraph canvasu, window globals, startup load
- `src/graph/state.ts` — singleton `graph` instance, `selectedNode`, `duplicateIds`
- `src/graph/helpers.ts` — `drawStatusBadge`, `drawDuplicateBadge`, `escHtml`
- `src/graph/nodes/` — třídy uzlů (LocationNode, EventNode, ItemNode, CharacterNode, NoteNode)
- `src/ui/autosave.ts` — auto-save logika (debounce 2s)
- `src/ui/stats.ts` — počítadlo uzlů v toolbaru
- `src/ui/panel.ts` — properties panel (render + event listenery + exit management)
- `src/ui/toolbar.ts` — tlačítka toolbaru (addNode, exportRpy, scanFiles, autoLayout, …)
- `src/ui/modals/` — config, help, validate, preview modály
- `src/types.ts` — sdílené TypeScript typy (Props interfaces, API response typy)
- `src/globals.d.ts` — ambient deklarace LiteGraph globálů + Window augmentace
- `src/style.css` — CSS s custom properties (`--bg`, `--accent`, `--ok`, `--node-loc`, …)
- `vite.config.ts` — proxy `/api` a `/lib` na :3001, build outDir `dist/`
- `.comfy.example.json` — vzorový config
- `.gitignore` — vylučuje `node_modules/`, `.comfy.json`, `comfy-graph.json`, `dist/`

## API

| Method | Route | Popis |
|---|---|---|
| GET | `/api/config` | Vrátí aktuální config (`gameDir`, `renpyExe`, `port`) |
| PUT | `/api/config` | Uloží config do `.comfy.json` |
| GET | `/api/check-gamedir` | Ověří, že `gameDir` vypadá jako Ren'Py `game/` složka |
| GET | `/api/graph` | Načte `comfy-graph.json` |
| PUT | `/api/graph` | Uloží `comfy-graph.json` (auto-save z frontendu každé 2s) |
| POST | `/api/validate` | Validuje graf (duplicitní ID, chybějící location_id u eventů, více start lokací, …) |
| POST | `/api/export-rpy` | Generuje `.rpy` soubory z grafu — Location→`locations/`, Event→`events/`, Quest→`quests/`; také auto-wire `script.rpy` |
| POST | `/api/wire-script` | Zapíše nebo appendne COMFY marker do `script.rpy` (volá se z conflict modálu) |
| POST | `/api/preview-rpy` | Vrátí preview `.rpy` obsahu pro konkrétní uzel (bez zápisu) |
| GET | `/api/scan` | Zkontroluje stav `.rpy` souborů pro každý uzel v grafu |
| POST | `/api/launch` | Spustí Ren'Py exe (detached) |

## Node typy

| Typ | Barva | Porty | Klíčové properties |
|---|---|---|---|
| `renpy/location` | Modrá | inputs: blank (auto-expands) / outputs: dynamické exity | `id`, `label`, `description`, `exits[]`, `isStart` |
| `renpy/event` | Oranžová | žádné | `id`, `location_id`, `trigger`, `trigger_label`, `prerequisite`, `time`, `repeatable`, `priority`, `notes` |
| `renpy/item` | Fialová | žádné | `id`, `name`, `description` |
| `renpy/character` | Teal | žádné | `id`, `name`, `voice`, `sprite_id` |
| `renpy/note` | Žlutohnědá | žádné | `text` (zobrazuje se přímo na uzlu, jen pro tvůrce) |
| `renpy/quest` | Tmavě červená | žádné | `id`, `title`, `description`, `stages` (newline-separated) |

### Location exits (dynamické porty)

`syncExitSlots()` aktualizuje výstupní sloty in-place (zachovává spojení) z `properties.exits`. Volá se vždy po editaci exitů v properties panelu a v `onConfigure()` (při načítání grafu ze souboru). Vstupní sloty (blank, bezejmenné) se spravují přes `_ensureOneBlankInput()` — vždy jeden volný slot navíc.

`removeExitAt(j)` správně odstraní konkrétní exit ze středu pole — odpojí slot j, přesune `origin_slot` v `graph.links` pro sloty j+1→j, odstraní poslední slot a splajsnuje `exits[]`.

### Obousměrné exity (bidir)

Exit lze označit jako obousměrný přes ↔ tlačítko v properties panelu. Bidir exit:
- Má `type = 'connection-bi'` (teal barva, dvojitý kabel = dvě paralelní čáry)
- Při aktivaci automaticky odstraní zpětné jednosměrné spojení z cílového uzlu
- Po reload grafu se barva kabelů obnoví z `link.type` (v `onConfigure()`)
- `returnName` property určuje název reverz-exitu generovaného při exportu

Kabel barvy jsou registrovány v `LGraphCanvas.link_type_colors` (ne v `slot_types_default_color` — tu LiteGraph pro kabely nepoužívá). Dvojitý kabel = monkey-patch `LGraphCanvas.prototype.renderLink` s `num_sublines=2`.

### Toolbar compact mode

Toolbar podporuje dvě zobrazení přepínatelná tlačítkem ⊟/⊞:
- **Klasický mód**: textové popisky, ikonky skryté
- **Kompaktní mód**: jen emoji ikonky s `title` tooltipem, texty skryté

Preference se ukládá do `localStorage['comfy-compact']`. `initCompactMode()` obnoví stav při startu.

### Auto-layout a skupiny

`autoLayout()` rozmístí uzly do 4 sloupců (Lokace, Eventy, Items/Questy, Postavy/Notes) a automaticky vytvoří pojmenované `LGraphGroup` kolem každé sekce. Skupiny s názvy "Lokace", "Eventy", "Items & Questy", "Postavy & Notes" jsou při každém spuštění auto-layoutu odstraněny a znovu vytvořeny — uživatelské skupiny s jiným názvem zůstanou netknuty.

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
- `{gameDir}/items/{id}.rpy` — Item uzly (pickup labely s `comfy_give()`)
- `{gameDir}/quests/{id}.rpy` — Quest uzly
- `{gameDir}/comfy_init.rpy` — inventář helpers + Character `define` řádky

Pokud `gameDir` není nastaven, exportuje do `{projectDir}/output/`.

### Start lokace a script.rpy

Každý Ren'Py projekt spouští hru z `label start:` v `script.rpy`. Po exportu comfy-renpy automaticky zajistí, aby `label start:` přešel do první lokace grafu:

- **isStart property** — Location uzel může mít `isStart: true` (checkbox 🏁 v properties panelu). Pouze jedna Location může být start; zaškrtnutí jiné automaticky odznačí předchozí. Fallback: pokud žádná nemá `isStart`, použije se první Location v grafu.
- **Detekce boilerplate** — pokud `script.rpy` obsahuje defaultní Ren'Py obsah (`You've created a new Ren'Py game.` + `define e = Character("Eileen")`), přepíše se celý soubor COMFY markerem.
- **Existující COMFY marker** — aktualizuje se jen marker blok `kind=start`, zbytek souboru zůstane.
- **Uživatelem upravený soubor** — export proběhne, ale zobrazí se `script-conflict` modal se třemi volbami: Přepsat / Appendnout marker / Nechat být.

`POST /api/wire-script { mode, startId }` — backend akce pro conflict modal.

`pickStartLocation(nodes)` helper v `server.js` — vrátí Location s `isStart === true`, nebo první Location, nebo `null`.

### Playable skeleton & Inventory systém

Export generuje hratelnou hru od prvního spuštění:
- **kind=body** marker (mezi header a exits/footer) — první export vyplní popis lokace nebo placeholder dialog. Re-export body **nikdy nepřepíše** (je to lidský/AI prostor).
- **comfy_init.rpy** — `default comfy_inventory = []`, `comfy_has(id)`, `comfy_give(id)`, `comfy_quest_stage/advance()`, plus `define` pro každou postavu.
- **Item pickup** — v exits menu lokace se přidají volby `"Sebrat: {name}" if not comfy_has("{id}"):` pro každý item s `location_id` shodujícím se s lokací.

### AI write-to-file

`POST /api/write-dialogue` — přijme `{ lgNodeId, content, graphData }`, najde soubor uzlu a zapíše `content` do `kind=body` markeru (smart insert: pokud body marker neexistuje, vloží ho před exits/footer). Frontend: tlačítko "💾 Zapsat do souboru" v generate modalu (zobrazí se po úspěšném AI generování).

## Scan

`GET /api/scan` čte aktuální `comfy-graph.json` ze serveru, pak pro každý Location/Event uzel:
- **missing** — soubor neexistuje
- **stub** — soubor existuje, marker přítomen, žádný dialog
- **written** — soubor má dialogové řádky (regex na `"`, `jump`, `menu`, `show`, atd.)
- **drift** — soubor existuje bez COMFY markeru, nebo soubor bez uzlu v grafu (orphan)

## Příkladový graf

`public/example-graph.json` — načte se tlačítkem "⬡ Příklad" v toolbaru (přepíše aktuální graf po potvrzení).

## Co NEDĚLAT

- **Neupravovat `dist/`** — generováno Vitem, vždy přepsáno při buildu
- **Žádná databáze** — `comfy-graph.json` je source of truth pro strukturu
- **Neparsovat .rpy hluboko** — scan hledá jen marker komentáře a pár regex vzorů
- **CLAUDE.md a README.md udržovat aktuální** při každé nové feature
