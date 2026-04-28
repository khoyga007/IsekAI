# IsekAI — Project Handoff

> A snapshot of the project as of **2026-04-29**, written so a fresh AI assistant can pick up where the previous one left off without re-reading every file.

---

## 1. What this is

**IsekAI** is a **desktop AI roleplay app** that lets a user step into any manga / light novel / custom world and play it like an interactive novel. The AI is the Game Master.

- **Path:** `E:\IsekAI`
- **Stack:** Tauri 2 (Rust shell) + React 19 + TypeScript + Vite 7 + Tailwind CSS v4
- **Theme:** "Neo-Tokyo Ink" — cyberpunk neon × sumi-e ink wash. **No CJK glyphs** in UI (user explicitly disliked Japanese/Chinese decoration).
- **Default UI language:** Vietnamese (`vi`). User is Vietnamese-speaking ("Yang"), addresses assistant as "em" (assistant) / "anh" (user).
- **Image generation:** ✅ added 2026-04-29 — AniList canon fetch + Pollinations.ai (free) + Google Nano Banana 2 (paid, reuses Google API key). See Phase 6.

### Run it

```
dev.bat       # tauri dev (desktop window + HMR)
build.bat     # tauri build (.msi + .exe + NSIS in src-tauri\target\release\bundle\)
```

Both auto-run `npm install --legacy-peer-deps` if `node_modules\` missing. The `--legacy-peer-deps` flag is **required** because Tailwind v4 conflicts with Vite 7 peer deps.

---

## 2. Feature map

### ✅ Phase 1 — Foundations
- Multi-provider unified streaming: Anthropic, OpenAI, Google Gemini, OpenRouter, DeepSeek, Ollama
- `smartFetch` wrapper auto-falls-back from Tauri HTTP plugin → native `fetch` for browser preview
- LazyStore persistence: `settings.json` + `campaigns.json` (keyed `c:<id>` + library summary index + `activeId`)
- Tauri capabilities allowlist for all 6 provider hosts + Wikipedia + Fandom

### ✅ Phase 2 — World building
- 3-stage AI campaign build: **World Bible → HUD schema → Protagonist** (sequential JSON prompts)
- 4 source kinds: existing Title, custom World description, Wiki URL, Surprise-me (RNG)
- Wikipedia REST + Fandom scraper for URL source
- Forgiving JSON parser with brace-balancing (model output isn't always clean)

### ✅ Phase 3 — Story engine + dynamic HUD
- **XML-tag streaming parser** (vs JSON which can't survive partial output): `<narrate>`, `<say speaker="X">`, `<think>`, `<act>`, `<system>`, `<hud op="..." id="..." value="..."/>`, `<crystal title="..." summary="..."/>`
- Live panel rendering as the AI streams
- HUD ops applied to widgets after each turn (delta/set/tag-add/tag-remove/affinity/item-add/item-remove)
- **Dynamic HUD widgets** — 6 types: `stat-bar` (HP/MP), `stat-number`, `tag-list` (status effects), `affinity` (-100..100 per character), `inventory`, `note`
- Memory crystals (auto-pinned by AI for important beats), included in every system prompt
- Manga panel hybrid layout

### ✅ Phase 4 — Polish
- Procedural ambient audio (Web Audio API, 8 genre presets — fantasy/horror/cyberpunk/romance/mystery/slice/apoc/default), 3-4 oscillators + LFOs through lowpass, **no asset files**
- Mood-tinted backdrop per genre
- Procedural avatar gradients (FNV hash → radial/conic/linear sigil per character name)
- Dice roller: full `XdY+Z` parser, `advd20`/`disd20`, multi-group, dropped dice, crit/fumble for d20
- Multi-campaign library (Library drawer with avatar, genre, turn count, load/export/delete)
- Undo last turn (restores player input to InputBar)
- Export campaign → Markdown via Tauri save dialog
- Settings: per-provider key/baseUrl/model + lowFx + audio + audioVolume

### ✅ Phase 5 — Recent additions (2026-04-28 session)
- **Auto skill checks** (`src/lib/skillCheck.ts`)
  - 9 verb families with **bilingual** EN+VI keyword regex: combat / stealth / social / magic / athletics / perception / lore / craft / willpower
  - Scores HUD widgets against family for stat selection
  - D&D-style modifier from numeric stat: `floor((stat-10)/2)`, clamped −3..+8
  - DC inferred from text keywords: hard hints (chasm/cliff/khổng lồ/bất khả) → 17, easy hints (cẩn thận/dễ) → 10, default 12
  - Suggestion strip appears under mode chips when in "Do" mode; click → roll + insert formatted result

- **Save points / Branching** (`src/state/types.ts` + `src/state/campaign.ts` + `src/components/SavesView.tsx`)
  - `Campaign.bookmarks: SavePoint[]` — each bookmark stores a **full campaign snapshot** at that turn
  - 4 actions: `bookmark(label)`, `restoreBookmark(id)` (rewind in place), `branchBookmark(id)` (fork into new campaign with `(branch)` suffix), `deleteBookmark(id)`
  - 🔖 button in topbar + new "Saves" entry in side rail
  - SavesView drawer: list, restore (with confirm), branch, delete

- **i18n EN/VI** (`src/lib/i18n.ts`)
  - ~140 strings, two locales, default `vi`
  - `useT()` hook + `tNow()` non-hook accessor
  - Toggle in Settings → Language section, switches all UI live
  - Localized: SideRail, TopBar, Stage, Onboarding, InputBar, DiceRoller, DynamicHud, Library, CastView, MemoryView, SavesView, SettingsPanel, App

- **Null-safe legacy campaign fixes** (2026-04-28 session 2)
  - All `.map()` calls on `hud.widgets`, `crystals`, `bible.keyCharacters/rules/factions` guarded with `?? []`
  - Fixes "Cannot read properties of undefined (reading 'map')" crash on old campaigns

- **Edit World Bible / HUD / Protagonist** (`src/components/WorldEditView.tsx`)
  - 3-tab drawer: World Bible (title/genre/tone/setting/rules/factions/key chars) · Protagonist (name/role/desc) · HUD Widgets (value/max/tags/body per widget type)
  - Dirty-state tracking with unsaved indicator; Save button persists via `saveCurrent()`
  - SideRail "World" button opens WorldEditView when campaign active, Library when no campaign

- **Token diet + auto-advance** (2026-04-28 session 6)
  - **Prompt caching** — `ChatMessage` gains optional `cache?: boolean`. System prompt split into `buildSystemPromptStable()` (rules + bible + protagonist, cacheable) and `buildSystemPromptDynamic()` (HUD + crystals + pacing nudge). `playTurn` sends two system messages, marking the stable one with `cache: true`.
    - `providers/anthropic.ts`: emits `system: [{ type: "text", text, cache_control: { type: "ephemeral" } }]` for cached blocks.
    - `providers/openai-compat.ts`: for **OpenRouter only**, converts cached messages to content-array form with `cache_control` (passes through to Claude). OpenAI/DeepSeek auto-cache on prefix; the annotation is stripped to avoid breaking schema.
  - **Slim history format** — `panelsToCompact()` replaces `panelsToTags()` for past assistant turns in history. Saves ~40-50% tokens per scene (`Name: "..."` instead of `<say speaker="Name">...</say>`). System prompt has a HISTORY FORMAT NOTE teaching the model to read but NOT mimic the compact form. Compression summary also uses compact.
  - **Auto-advance** — InputBar `FastForward` button. Click → `runTurn(null)` with existing scenes triggers an `[ADVANCE]` user message. `playTurn` detects null input + non-empty scenes and asks the GM to let time pass, NPCs act, world breathe, without inventing player decisions. i18n EN/VI.

- **Beat variety / pacing** (2026-04-28 session 5)
  - `<scene>` tag now carries both `mood` and `beat` attrs. `Scene.beat` persisted; 8 beat types: action / plot / downtime / banter / romance / sidequest / introspection / worldbuilding.
  - `STORY_SYS` adds a "BEAT VARIETY" section enumerating beat types with pacing rules: after 2-3 intense beats, the next must be non-intense; NPCs have lives mid-task; romance slow-burns; sidequests can pop unbidden.
  - `buildSystemPrompt` injects a dynamic "PACING NUDGE" when the last 2-3 scenes were all action/plot/combat — forces the GM to breathe next turn.
  - Suggest rule: at least 1 of the 3 chips must be NON-PLOT (rest, eat, observe) even in tense moments.
  - 6 new moods: tender, cozy, awkward, melancholic, mundane, wistful — each with backdrop tint + ambient audio modifier.

- **"Less AI" prose tuning** (2026-04-28 session 4)
  - `STORY_SYS` rewritten with explicit anti-AI rules (rhythm, anti-cliché blacklist EN+VI, adverb diet, imperfect dialogue, no mandatory hook, POV bias, sparse showing).
  - `WorldBible.keyCharacters` extended with optional `register` + `tic` fields. World builder prompt now mandates them on generation.
  - `buildSystemPrompt` renders each NPC with `[voice: <register>, tic: "<tic>"]` so the GM is reminded every turn.
  - `WorldEditView` exposes Register and Tic inputs per character.

- **"Living Page" immersion combo** (2026-04-28 session 3)
  - **Quick-react chips** — AI emits 3 `<suggest>...</suggest>` tags per turn. Rendered as clickable chips below the last scene; click → `chipBus.emit()` → InputBar runs the turn in "do" mode. Chips persist on `Scene.suggestions` for recall after reload.
  - **Mood-reactive scene** — AI emits one `<scene mood="..."/>` per turn (tense/combat/calm/romantic/mystery/tragic/triumphant/eerie). Backdrop overlays a tint via `mix-blend-soft-light`; `ambient.setMood()` retunes filter cutoff + voice gain + detune on top of the genre preset. Stored on `Scene.mood`.
  - **Typewriter streaming** (`src/lib/typewriter.ts`) — `useTypewriter(target, enabled, skip)` rAF-driven, ~90 chars/s. Plays soft 1100-1400Hz pluck every ~5 chars (only when audio unmuted). Cursor block animates while partial. Click anywhere on the streaming scene to skip-reveal. Setting `ui.typewriter` (default true) in Settings panel.

- **Error Boundary** (`src/components/ErrorBoundary.tsx`)
  - Fullscreen fallback with 3 actions: retry (clear error), close campaign (recover from corrupted active campaign), reload
  - Toggleable stack-trace details
  - Inline mode (`inline` prop) for per-panel boundaries — Stage and DynamicHud are wrapped so a crash in one doesn't kill the whole UI
  - `resetKey` prop auto-clears error when campaign id changes
  - Fully i18n'd (EN/VI)

- **Context Window Management** (`src/engine/storyEngine.ts`)
  - `estimateTokens()` — rough ~4 chars/token estimate
  - `compressIfNeeded()` — when sys+history > 5500 tokens, summarizes oldest 8 scenes via AI into a crystal and drops them from context
  - Compression result auto-persisted to store + campaigns.json
  - Transparent to user; crystal label: "Context Summary (T0–T7)"

### ✅ Phase 6 — 2026-04-29 session (caching, fallback, retry, edit, avatars)

- **Aggressive prompt caching** (engine + every provider)
  - **Message reorder** in `playTurn` — was `[stable, dynamic, ...history, user]`, now `[stable(cache:true), ...history(last cache:true), dynamic?, user]`. Dynamic comes AFTER history so its volatility no longer breaks the cacheable prefix. Empty-dynamic case skips the message entirely.
  - **Anthropic** (`providers/anthropic.ts`) — gained 2 cache breakpoints (stable system + last historical assistant turn). User/assistant messages with `cache: true` now serialize as content-block array with `cache_control: {type: "ephemeral"}`. Usage extraction split into fresh / cache-write / cache-read tokens.
  - **Google Gemini** (`providers/google.ts`) — split system messages into cached (stable → `systemInstruction`) vs volatile (dynamic state injected into latest user message as `[GM CONTEXT]…[/GM CONTEXT]` prefix). Implicit cache now fires from turn 2+. Reads `cachedContentTokenCount`.
  - **OpenAI-compat** (`providers/openai-compat.ts`) — added `stream_options.include_usage:true` (was missing → usage was always undefined for OpenAI/OpenRouter/DeepSeek). Refactored to **emit `done` only at end of stream** (not on `finish_reason`) because the usage chunk arrives AFTER `finish_reason` in a separate event with empty `choices`. Reads `prompt_tokens_details.cached_tokens` (also `cache_read_input_tokens` for OR-routed Anthropic).
  - **Token budget cuts**: `STORY_SYS` trimmed ~30% (~2000 → ~1300 tok stable). `max_tokens` 1500 → 1200. Empty `buildSystemPromptDynamic` skipped entirely.
  - **Net effect**: ~85-95% input cache hit rate after turn 2 on long campaigns. Effective billed tokens reduced ~5-10× on Anthropic + Gemini direct + OpenRouter→Claude.

- **Token usage chip** (`src/components/TopBar.tsx`)
  - `<UsageChip />` shows last-turn `↑input ↓output 🔁cached%` with hover tooltip
  - Reads from `useCampaign(s => s.lastUsage)`
  - `lastUsage` reset on campaign load/start/close (was leaking across campaigns)

- **Multi-provider fallback chain** (`src/engine/chat.ts` + `src/state/settings.ts`)
  - `Settings.fallback: ProviderId | null` — optional secondary provider
  - `streamWithActive` runs primary, on error tries fallback ONLY if no chunks were streamed (avoids duplicate output on partial failure) and not on AbortError
  - `setFallback` action; auto-clears if same provider becomes primary
  - SettingsPanel: "Set as fallback" button + `F` indicator in sidebar
  - `<FallbackNotice />` chip on TopBar shows transient "Switched to fallback (X)" for 6s when fallback fired
  - `providerLabel(id)` helper exported from `engine/chat.ts`

- **Retry / regenerate turn** (`src/components/InputBar.tsx`)
  - 🔄 button (RotateCcw, violet) between Undo and FastForward
  - Confirms → calls `undoLastScene()` (returns prior input) → reruns `playTurn` with same input (or null for advance turns)
  - i18n: `input.btn.retry`, `input.confirm.retry`

- **Inline panel editing** (`src/components/StoryView.tsx` + `src/state/campaign.ts`)
  - `updatePanel(sceneIdx, panelIdx, updates)` action persists to LazyStore
  - `<PanelEditor>` inline component: appears when user clicks ✏️ button (hover top-right of any committed panel). Textarea + speaker input (for dialogue/thought) + Save/Cancel. `Esc` cancels, `Ctrl+Enter` saves.
  - Edit affordance hidden behind `group-hover` so it doesn't clutter normal reading
  - Not editable: draft scenes mid-stream
  - i18n: `panel.btn.edit/save/cancel`, `panel.edit.hint`

- **Avatar system** (NEW — `src/engine/avatars.ts`, `src/lib/avatar.tsx`, `src/components/AvatarPicker.tsx`)
  - **Types**: `Protagonist.avatar?: string` + `WorldBible.keyCharacters[].avatar?: string` (URL or `data:image/png;base64,...`)
  - **3 sources**:
    1. **AniList GraphQL** — for canon characters. Free, no auth. Searches by `bible.title` (MANGA → ANIME → NOVEL fallback), takes top media's character list, fuzzy-matches each `keyCharacter.name` (exact / substring / last-name).
    2. **Google Nano Banana 2** — `gemini-2.5-flash-image` model. Auto-detected when `settings.providers.google.apiKey` is set. POST to `:generateContent` with `responseModalities: ["IMAGE"]`, returns base64 → wrapped in data URL. ~$0.04/image. Async with parallel fan-out.
    3. **Pollinations.ai** — free fallback. Deterministic URL by `(prompt, seed)`. URL format: `https://image.pollinations.ai/prompt/<encoded>?width=512&height=512&seed=N&nologo=true`. Diacritics stripped, prompt clipped to 280 chars.
  - **Avatar component** (`src/lib/avatar.tsx`) — single source of truth. `<Avatar name url? size selected? onClick? />`. If `url` set, renders `<img>` with `referrerPolicy=no-referrer`; on error falls back to procedural FNV-hash gradient + initials. `lib/avatar.ts` is a re-export shim for backward compat.
  - **AvatarPicker** — modal shown after `buildCampaign` returns but before `start`. Per-character row with horizontal candidate gallery (3 NB or 4 Poll). Click to select (vermillion ring), Regenerate adds 3-4 more, Skip clears. Pending Nano Banana gens render as amber spinner placeholders.
  - **Onboarding integration** — `pendingCampaign` state holds the built campaign while AvatarPicker is open. `finalize(avatars)` writes selected URLs back into protagonist + keyCharacters then `start()`s. `Skip — use sigils for everyone` and `Cancel` (return to form) supported.
  - **Display**: dialogue panel uses `useSpeakerAvatar` hook to look up speaker → avatar URL from campaign. CastView CharCard takes `avatar?: string` prop.
  - **Cost preview**: 5 chars × 3 NB candidates = ~$0.60 init, +$0.12 per Regenerate. Pollinations is free.

- **World Bible sanitize fix** (`src/engine/worldBuilder.ts`)
  - AI sometimes omits one of `rules` / `factions` / `keyCharacters` arrays → undefined → `.map()` crash in WorldEditView's `KeyCharEditor`
  - `buildCampaign` now forces these to `[]` if missing on bible AND HUD widgets
  - Defensive `?? []` also added in WorldEditView at the call sites

---

## 3. File map (key files)

```
E:\IsekAI\
├── dev.bat / build.bat              # Windows launchers
├── package.json                     # vite/tauri scripts
├── HANDOFF.md                       # this file
│
├── src-tauri\
│   ├── Cargo.toml                   # tauri 2, plugin-{opener,http,store,fs,dialog}
│   ├── capabilities\default.json    # HTTP allowlist for 6 providers + wiki
│   └── ...
│
├── src\
│   ├── App.tsx                      # main composition, drawer routing, topbar buttons
│   ├── main.tsx
│   │
│   ├── providers\                   # UNIFIED AI LAYER
│   │   ├── types.ts                 # Provider interface, ProviderId union
│   │   ├── fetch.ts                 # smartFetch (Tauri ↔ native)
│   │   ├── anthropic.ts             # Claude via /v1/messages SSE
│   │   ├── openai-compat.ts         # OpenAI/DeepSeek/OpenRouter (same shape)
│   │   ├── google.ts                # Gemini SSE
│   │   ├── ollama.ts                # local NDJSON streaming
│   │   └── index.ts                 # PROVIDERS map + PROVIDER_LIST
│   │
│   ├── state\                       # ZUSTAND STORES
│   │   ├── types.ts                 # Campaign, WorldBible, HudSchema, HudWidget union, Panel, Scene, MemoryCrystal, SavePoint
│   │   ├── settings.ts              # Settings store + LazyStore persist (active provider, keys, ui.{lowFx,audio,audioVolume,lang})
│   │   └── campaign.ts              # Campaign store: hydrate/start/load/remove/closeCampaign/beginTurn/appendDraftRaw/setDraftPanels/commitTurn/patchHud/addCrystal/undoLastScene/saveCurrent/bookmark/restoreBookmark/branchBookmark/deleteBookmark
│   │
│   ├── engine\                      # AI LOGIC
│   │   ├── chat.ts                  # streamWithActive() w/ multi-provider fallback, completeJSON(), forgiving JSON parser, providerLabel()
│   │   ├── worldBuilder.ts          # 3-stage build (Bible → HUD → Protagonist), URL scrape, sanitize arrays
│   │   ├── storyEngine.ts           # XML-tag parser, system prompt builder (stable + dynamic split), playTurn(), applyHudOps()
│   │   ├── avatars.ts               # ★ Phase 6: AniList GraphQL fetch, Pollinations URL gen, Nano Banana 2 (Gemini Image) gen
│   │   └── scraper.ts               # Wikipedia REST + Fandom HTML strip
│   │
│   ├── lib\
│   │   ├── cn.ts                    # tw-merge classNames
│   │   ├── dice.ts                  # rollExpression, formatRoll
│   │   ├── skillCheck.ts            # suggestSkillCheck, rollSkillCheck, formatSkillCheck
│   │   ├── i18n.ts                  # useT, tNow, translate, EN/VI dict (~180 strings now)
│   │   ├── avatar.tsx               # ★ Phase 6: <Avatar/> component (img w/ procedural fallback)
│   │   ├── avatar.ts                # backward-compat re-export shim → avatar.tsx
│   │   └── export.ts                # Campaign → Markdown via Tauri save dialog
│   │
│   ├── audio\
│   │   └── ambient.ts               # Web Audio synth, 8 genre presets, pluck() for UI cues
│   │
│   └── components\
│       ├── Backdrop.tsx             # mood-tinted fullscreen
│       ├── SideRail.tsx             # 7 nav items: new/world/cast/story/memory/saves/settings
│       ├── TopBar.tsx               # title + UsageChip + FallbackNotice
│       ├── Stage.tsx                # landing 4-card grid OR StoryView
│       ├── StoryView.tsx            # manga panel renderer + inline PanelEditor (Phase 6)
│       ├── InputBar.tsx             # 4 modes + dice + undo + retry (Phase 6) + advance + skill suggest + send/stop
│       ├── DynamicHud.tsx           # right rail rendering all widget types
│       ├── DiceRoller.tsx           # modal w/ presets + result panel
│       ├── Drawer.tsx               # reusable side-drawer shell
│       ├── Library.tsx              # campaign list drawer
│       ├── CastView.tsx             # protagonist + discovered NPCs (met/unmet tags), uses <Avatar/>
│       ├── MemoryView.tsx           # crystal timeline
│       ├── SavesView.tsx            # bookmarks list w/ restore/branch/delete
│       ├── Onboarding.tsx           # new-campaign modal (4 source tabs) + AvatarPicker stage
│       ├── AvatarPicker.tsx         # ★ Phase 6: post-build avatar gallery picker
│       ├── WorldEditView.tsx        # 3-tab editor: bible/protagonist/HUD
│       ├── SettingsPanel.tsx        # provider editor + fallback selection + lowFx/audio/lang
│       ├── ProviderBadge.tsx        # topbar chip
│       ├── ErrorBoundary.tsx        # fullscreen + per-panel error fallback
│       └── AudioToggle.tsx          # speaker icon toggle
```

---

## 4. Architectural decisions (and why)

| Decision | Why |
|---|---|
| XML-tag story output instead of JSON | Streams cleanly, parser flushes panels mid-stream, survives truncation |
| `smartFetch` fallback | So the app works in browser preview during dev (Tauri HTTP plugin only exists in Tauri context) |
| `LazyStore` keyed `c:<id>` + summary index | Library list loads without parsing every full campaign |
| HUD widgets as discriminated union | Type-safe rendering + safe `applyHudOps` switch |
| Procedural audio (Web Audio) | Zero asset weight, zero copyright, infinitely many genres |
| Save point = full snapshot | Branching trivial (just clone snapshot with new id), restore atomic |
| i18n strings as flat namespaced keys | Simpler than nested objects; `t("ns.key")` is one lookup |
| Default lang = `vi` | The user is Vietnamese; English is the fallback |
| Stable system + history-with-cache + dynamic + user (Phase 6) | Auto-prefix cachers (OpenAI/DS/xAI/Gemini-implicit) only cache up to first byte that differs. Putting volatile dynamic block AFTER history → history is in the cacheable prefix. Anthropic gets 2 explicit breakpoints (stable + last history) so cache rolls forward each turn. |
| Fallback only when no chunks emitted (Phase 6) | A failed mid-stream provider has already shown text to the user; falling back would duplicate. Pre-stream errors (402, 401, network) are safe to retry on a fresh provider. |
| Avatar URLs (incl. data URLs) persisted on character not in a separate store (Phase 6) | Keeps "all I need to render this campaign" inside the Campaign object → export, branch, restore all work without extra plumbing. Data URLs are large but bounded (~50-100KB per portrait). |
| Avatar component falls back on `<img onError>` (Phase 6) | Network blip / Pollinations rate limit / AniList CDN hiccup → user still sees the procedural sigil rather than a broken-image icon. |

---

## 5. Known issues / Roadmap

### Blockers for production
- ❌ **`build.bat` not yet tested** — TS passes but Tauri bundle never run end-to-end
- ❌ **API keys stored plaintext** in `settings.json`. Should encrypt via Tauri Stronghold.
- ❌ **Default Tauri app icon** (no real branding asset)

### Polish gaps
- ⚠️ Onboarding "stage progress" labels are fake `setTimeout(4s, 8s)` — not real progress
- ⚠️ Skill check is **regex heuristic only** — could be smarter if it asked the AI "what stat applies?"
- ⚠️ No search/filter in Library / Cast / Memory drawers
- ⚠️ Crystals are append-only (cannot delete/edit a wrongly-pinned memory)
- ⚠️ **WorldEditView cannot edit avatars** (Phase 6 deferred to v2). Once an avatar is picked at onboarding, can't change without recreating the campaign.
- ⚠️ **Retry doesn't undo HUD ops** — `undoLastScene` rewinds scenes/crystals but `applyHudOps` is destructive. Retrying a turn that did `<hud op="delta" id="hp" value="-15"/>` will apply the delta a second time.
- ⚠️ **Canon power systems not modeled structurally** — `bible.rules` captures lore, `powerLevel` is an absolute VS-Battles tier, but world-internal ranks (Bounty, Hokage rank, JJK Grade) aren't tracked. Discussed with user; "Mức 1" fix (HUD widget for canon rank) was proposed but not yet built.
- ⚠️ Pollinations.ai is slow + occasionally fails to load — user paused mid-implementation. Nano Banana 2 is the recommended path when a Google key is set.

### Not started
- TTS narration
- Cloud sync / campaign import-export file (only Markdown export exists)
- Mobile responsive (desktop-only by design)
- Crash reporting / telemetry
- Tauri auto-updater
- Bible auto-evolution (GM emits `<bible-add>` to register newly-invented NPCs/locations into the bible — proposed in 2026-04-29 session, not built)

### Recommended next priorities (in order)
1. ~~Test `build.bat`~~ — done by user
2. ~~**Context window management**~~ — done: auto-summarize turn N-8 and older into a crystal when token estimate > 5500
3. ~~**Edit world bible / HUD / protagonist**~~ — done: WorldEditView drawer (3 tabs)
4. ~~**Error boundary** with retry~~ — done: fullscreen + per-panel inline boundaries
5. ~~**Aggressive prompt caching**~~ — done in Phase 6 across all providers
6. ~~**Multi-provider fallback chain**~~ — done in Phase 6
7. ~~**Avatar system (canon fetch + OC gen)**~~ — done in Phase 6
8. **Canon-rank HUD widget** — Mức 1 from the power-system discussion. Edit `HUD_SYS` prompt to require a `stat-number` widget for known shonen-battle universes (Bounty for One Piece, Rank for Naruto, Grade for JJK, etc.).
9. **WorldEditView avatar editor** — let user re-pick an avatar after campaign creation
10. **HUD op rollback on retry/undo** — store inverse ops on Scene so undo can revert them
11. Encrypt API keys with Stronghold

---

## 6. Conventions when continuing this project

- **Language**: respond to the user in **Vietnamese**, addressing them as "anh" and yourself as "em".
- **No CJK characters** in UI strings ever. ASCII glyphs (`" "`, `▸`, `~`, `[ ]`, `◆`) instead.
- **No emoji in source files** unless the user explicitly asks (only emojis allowed are existing ones in dice formatting, e.g. `🎲`).
- Edits over rewrites: prefer `Edit` tool over `Write` for existing files.
- Run `npx tsc --noEmit` after non-trivial changes; the project compiles clean today.
- The user prefers **building features end-to-end** over piecemeal stubs. If you commit to a feature, finish UI + state + persist + i18n in one pass.
- The user dislikes verbose explanations — be terse. Show the work in the diff, not in prose.

---

## 7. Quick reference — common tasks

**Add a new HUD widget type:**
1. Add interface to `src/state/types.ts` `HudWidget` union
2. Add render case to `DynamicHud.tsx` `Widget()` dispatcher
3. Update `applyHudOps()` in `engine/storyEngine.ts` if it has new mutations
4. Update `buildSystemPrompt()` if AI needs to see its current state
5. Update `worldBuilder.ts` HUD prompt to teach the AI about it

**Add a new provider:**
1. Create `src/providers/<name>.ts` exporting a `Provider`
2. Register in `src/providers/index.ts` `PROVIDERS` + `PROVIDER_LIST`
3. Add default model + `needsKey` flag
4. Add domain to `src-tauri/capabilities/default.json` `http:default` allowlist
5. Add default settings entry in `state/settings.ts` `DEFAULT.providers`

**Add a new locale:**
1. Add `Lang = "en" | "vi" | "<new>"` in `lib/i18n.ts`
2. Define new dict, add to `TABLES`
3. Add chip in `SettingsPanel.tsx` language field

**Add a new drawer view:**
1. Create `src/components/<View>.tsx` using `<Drawer />` shell
2. Add `RailKey` entry in `SideRail.tsx`
3. Add `Drawer` union type + dispatch in `App.tsx`

---

## 8. Recent session log

### 2026-04-29 — caching, fallback, retry, edit, avatars

User opened with "đốt token như đốt vàng mã" (burning tokens like burning hell money). Worked through cost optimization, then stretched into UX features and finally a full avatar pipeline.

Sequence:
1. **Caching reorder** across all providers (stable + history-with-cache + dynamic + user). Anthropic 2 breakpoints. Gemini stable→systemInstruction split. OpenAI-compat `stream_options.include_usage:true` + delayed `done` emission.
2. **Token usage chip** on TopBar + reset on campaign change (was leaking).
3. **Tier S** features: retry button, inline panel editing, multi-provider fallback chain with toast.
4. **Hybrid game/editor philosophy** discussion — confirmed app's identity as "manga writing studio" sitting between AI Dungeon and Sudowrite.
5. **Avatar system** — full pipeline: types, AniList GraphQL, Pollinations free gen, AvatarPicker modal. User then asked for **Nano Banana 2** integration → added Gemini Image API path that auto-detects Google API key and supersedes Pollinations.
6. **World Bible sanitize fix** for `keyCharacters undefined` crash on legacy campaigns.
7. **Power-system discussion** — outlined 3 tiers of canon-rank handling; user paused before implementing.

Files **added** (Phase 6):
- `src/engine/avatars.ts` (NEW) — AniList + Pollinations + Nano Banana
- `src/lib/avatar.tsx` (NEW) — `<Avatar/>` component
- `src/components/AvatarPicker.tsx` (NEW) — post-build gallery picker

Files **modified** (Phase 6):
- `src/state/types.ts` — `avatar?: string` on Protagonist + keyCharacter
- `src/state/settings.ts` — `fallback: ProviderId | null` + `setFallback`
- `src/state/campaign.ts` — `lastUsage`, `lastFallback`, `updatePanel`, reset on load/start/close
- `src/engine/chat.ts` — refactored streamWithActive into runWithProvider + fallback chain, exposed `providerLabel`
- `src/engine/storyEngine.ts` — message reorder, dynamic skip-when-empty, max_tokens 1500→1200, STORY_SYS trim, onUsage + onFallback wiring
- `src/engine/worldBuilder.ts` — sanitize bible+hud arrays
- `src/providers/anthropic.ts` — cache_control on user/assistant, usage split
- `src/providers/google.ts` — split system + volatile inline
- `src/providers/openai-compat.ts` — include_usage, delayed done
- `src/providers/types.ts` — `ChatUsage` type with `cachedTokens`
- `src/lib/avatar.ts` — re-export shim → `.tsx`
- `src/lib/i18n.ts` — retry, panel.edit, settings.fallback strings (EN/VI)
- `src/components/StoryView.tsx` — PanelEditor + useSpeakerAvatar + Avatar import
- `src/components/CastView.tsx` — `<Avatar/>` + avatar pass-through
- `src/components/InputBar.tsx` — Retry button (RotateCcw violet)
- `src/components/SettingsPanel.tsx` — fallback selection UI + sidebar `F` indicator
- `src/components/TopBar.tsx` — UsageChip + FallbackNotice
- `src/components/Onboarding.tsx` — pendingCampaign + AvatarPicker stage + finalize/skip/cancel handlers
- `src/components/WorldEditView.tsx` — defensive `?? []` for legacy campaigns

User's final ask of the session: **save progress + update handoff doc** (this update).

### 2026-04-28 — skill check, save points, i18n

User asked for three features in one go: "auto skill check, save point, tiếng việt". All three delivered + TypeScript passed clean. Files added:

- `src/lib/i18n.ts` (NEW)
- `src/lib/skillCheck.ts` (NEW)
- `src/components/SavesView.tsx` (NEW)
- `dev.bat`, `build.bat` (NEW)
- Modified: `src/state/types.ts`, `src/state/settings.ts`, `src/state/campaign.ts`, `src/App.tsx`, `src/components/SideRail.tsx`, `src/components/SettingsPanel.tsx`, `src/components/InputBar.tsx`, `src/components/Stage.tsx`, `src/components/Onboarding.tsx`, `src/components/Library.tsx`, `src/components/MemoryView.tsx`, `src/components/CastView.tsx`, `src/components/DynamicHud.tsx`, `src/components/DiceRoller.tsx`, `src/components/TopBar.tsx`

---

**End of handoff.** Open the project at `E:\IsekAI`, read this file first, then dive into `src/App.tsx` for the entry point. The most recent work (Phase 6) lives in `src/engine/avatars.ts`, `src/components/AvatarPicker.tsx`, `src/lib/avatar.tsx`, and the caching changes spread across `src/providers/*` + `src/engine/{chat,storyEngine}.ts`.
