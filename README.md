# ⬡ Comfy-Renpy

Vizuální node-based editor pro návrh struktury [Ren'Py](https://www.renpy.org/) her — inspirovaný [ComfyUI](https://github.com/comfyanonymous/ComfyUI).

Navrhuješ místnosti, propojuješ je exity, přidáváš eventy, itemy a postavy. Editor pak vygeneruje `.rpy` kostru, do které dopíšeš dialogy. Opakovaný export zachová vše, co jsi napsal.

![Screenshot](docs/screenshot.webp)

## Funkce

- **Grafický editor** místností a jejich propojení (LiteGraph.js)
- **6 typů uzlů**: Location, Event, Item, Character, Note, Quest
- **Obousměrné exity** — kabel ↔ se vykreslí jako dvojitá teal čára, reverzní exit se vygeneruje při exportu
- **Inventář** — Item uzly generují pickup labely, lokace dostanou volby "Sebrat" v menu, `comfy_init.rpy` obsahuje `comfy_has()` / `comfy_give()` helpery
- **Quest log UI** — export vygeneruje `comfy_screens.rpy` s tlačítkem "Questy N" vpravo nahoře a modálním panelem s aktivními questy (hinty) a dokončenými; soubor je jen tvůj, nikdy se nepřepíše
- **Auto-wire script.rpy** — export automaticky nastaví `label start:` na první lokaci grafu; defaultní Ren'Py boilerplate (Eileen) se nahradí bezpečně
- **Hratelný skeleton** — první export vyplní popis lokace jako narátorskou řádku, hra je okamžitě hratelná; `body_text` property na Event/Item uzlu přednaplní dialog při prvním exportu
- **AI → soubor** — vygenerovaný dialog lze zapsat přímo do .rpy tlačítkem "💾 Zapsat do souboru"
- **Validace** grafu před exportem (duplicitní ID, chybějící vazby)
- **Export do .rpy** — generuje stub soubory s `[COMFY-START/END]` markery
- **Preview** — náhled vygenerovaného `.rpy` bez zápisu na disk
- **Round-trip bezpečný** — re-export přepíše jen strukturu, tvůj dialog zůstane
- **Scan** — zobrazí stav každého uzlu (written / stub / missing / drift)
- **Auto-layout** — rozmístí uzly do sekcí a automaticky vytvoří pojmenované skupiny
- **Compact mode** — přepínání toolbaru mezi ikonkami a textovými popisky (⊟/⊞)
- **Auto-save** grafu každé 2 sekundy
- **TypeScript + Vite** frontend s plnou typovou kontrolou

## Rychlý start

```bash
git clone https://github.com/Bumprdlik/comfy-renpy
cd comfy-renpy
npm install

# Vývoj — Express :3001 + Vite dev server :5173
npm run dev
# → otevři http://localhost:5173

# Produkce
npm run build   # sestaví frontend do dist/
npm start       # Express :3001 servíruje dist/
# → otevři http://localhost:3001
```

## Jak začít nový projekt

Comfy-renpy nevytváří Ren'Py projekt sám — potřebuješ ho nejdřív vytvořit v Ren'Py launcheru, který vygeneruje správnou strukturu (`gui/`, `options.rpy`, `script.rpy` a další soubory). Po prvním exportu comfy-renpy automaticky přepíše defaultní `script.rpy` (intro s Eileen) tak, aby hra začínala přímo v tvé první lokaci.

**Postup:**

1. Otevři **Ren'Py launcher** → *Create New Project* → zadej název a umístění.
2. Projekt bude mít tuto strukturu:
   ```
   MujProjekt/         ← kořen projektu (sem ukazuje Ren'Py launcher)
     game/             ← sem patří .rpy soubory
       gui/
       options.rpy
       script.rpy
     log.txt
   ```
3. V comfy-renpy klikni na **⚙ Nastavení** a nastav `gameDir` na cestu ke složce **`game/`** (ne na kořen projektu).

> **Časté chyby:**
> - `gameDir` ukazuje na kořen projektu (`MujProjekt/`) místo na `MujProjekt/game/` → export jde na špatné místo
> - `gameDir` ukazuje na složku Ren'Py SDK místo na tvůj projekt
>
> Comfy-renpy tě na obě chyby upozorní při uložení nastavení.

## Konfigurace

Klikni na **⚙ Nastavení** v toolbaru a nastav:

| Pole | Popis |
|---|---|
| **gameDir** | Cesta k `game/` adresáři tvého Ren'Py projektu. Export ukládá soubory sem. |
| **renpyExe** | Cesta k `renpy.exe` — potřebné pro tlačítko ▶ Spustit. |

Nastavení se uloží do `.comfy.json` vedle `server.js` (není verzováno).

Alternativně vytvoř `.comfy.json` ručně podle `.comfy.example.json`:

```json
{
  "port": 3001,
  "gameDir": "C:/mygame/game",
  "renpyExe": "C:/renpy/renpy.exe"
}
```

## Typy uzlů

### Location
Místnost v herním světě. Pojmenované **exity** (výstupní porty) propojuješ šipkami do jiných místností — tím vzniká mapa hry. Checkbox **🏁 Start lokace** označí, odkud hra začíná — export pak nastaví `label start:` v `script.rpy` na tuto lokaci. Pokud žádná není označena, použije se první lokace v grafu.

### Event
Událost/scéna vázaná na lokaci. Nastavíš trigger (`auto_enter`, `menu_choice`, `condition`), prerekvizitu (Python výraz), čas dne a prioritu.

### Item
Předmět v herním světě. Slouží jako vizuální poznámka — lze ho propojit s eventem jako prerekvizitu.

### Character
Postava s hlasem/stylem (pro AI generování dialogů) a sprite ID.

### Note
Volná textová poznámka přímo na canvasu. Exportem ani scanem není dotčena.

### Quest
Quest / úkol s fázemi. Generuje `.rpy` do `{gameDir}/quests/` s proměnnými `{id}_active`, `{id}_stage` a `{id}_completed`. Každá fáze ve `stages` textareu může mít hint ve formátu `text fáze | hint pro hráče`.

**Quest helpery** (z `comfy_init.rpy`):
- `comfy_quest_start("id")` — aktivuje quest
- `comfy_quest_advance("id")` — posune fázi; po poslední fázi označí jako dokončený
- `comfy_quest_active("id")` / `comfy_quest_completed("id")` — bool stav

**Quest log UI** — po exportu obsahuje hra obrazovku `comfy_quest_log` dostupnou přes tlačítko "Questy N" vpravo nahoře. Styling a pozici lze upravit přímo v `comfy_screens.rpy`.

## Export a round-trip

Tlačítko **Export .rpy** nejprve validuje graf. Pokud jsou nalezeny chyby nebo varování, zobrazí se dialog — s varováními lze exportovat přesto.

Soubory jdou do `{gameDir}/locations/` a `{gameDir}/events/`.

Každý soubor má strukturu:

```renpy
# [COMFY-START id=kitchen kind=header]
label location_kitchen:
# [COMFY-END]

    "Voní tu čerstvá káva."   ← tvůj dialog — nikdy nepřepsán
    a "Dobré ráno."

# [COMFY-START id=kitchen kind=exits]
    menu:
        "north":
            jump location_hall
    jump location_kitchen
# [COMFY-END]
```

Opakovaný export přepíše **jen** bloky mezi markery. Vše ostatní zůstane nedotčeno.

## Scan

Tlačítko **Scan** zkontroluje stav každého uzlu a zobrazí barevný badge:

| Badge | Stav |
|---|---|
| 🟢 zelená | **written** — soubor má dialogový obsah |
| 🟡 žlutá | **stub** — soubor existuje, jen kostra |
| ⚫ šedá | **missing** — soubor ještě neexistuje |
| 🔴 červená | **drift** — soubor bez markeru nebo orphan |

## Klávesové zkratky

| Zkratka | Akce |
|---|---|
| `L` | přidat Location uzel |
| `E` | přidat Event uzel |
| `I` | přidat Item uzel |
| `C` | přidat Character uzel |
| `N` | přidat Note uzel |
| `Q` | přidat Quest uzel |
| `G` | přidat skupinu (LGraphGroup) |
| `Ctrl+F` | focusovat vyhledávací pole |
| `Pravý klik` na canvas | kontextové menu (Add Node) |
| `Del` / `Backspace` | smazat vybraný uzel nebo hranu |
| `Ctrl+Z` | undo |
| `Ctrl+C` / `V` | kopírovat / vložit uzly |
| `Escape` | zavřít modál |

## Licence

MIT
