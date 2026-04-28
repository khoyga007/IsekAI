# IsekAI

> **Step into any manga, light novel, or world of your own making.**
> An interactive AI roleplay desktop app — half game, half manga writing studio.

`vô vàn câu chuyện` · infinite tales

---

## What is this?

IsekAI is a **desktop AI roleplay engine** built around a simple premise: name a manga or describe a world, and an AI Game Master writes a manga-panel-style story with you, turn by turn. You can play it like AI Dungeon, edit it like a writing tool, and every scene streams in live with character avatars, mood-tinted backdrops, procedural ambient audio, and a HUD that adapts to the genre.

It's the kind of thing you build when you want both:

- the **immersion** of being inside the story (panels, dialogue bubbles, avatars, audio)
- the **control** of being the editor (retry the GM, edit a wrong-canon line, branch a save point, switch providers when one runs out of credit)

---

## Highlights

| Area | What you get |
|---|---|
| **Worlds** | 4 source kinds — known title, custom world, Wiki/Fandom URL, surprise-me. AI builds a World Bible (genre, tone, rules, factions, key cast) + genre-fitting HUD + a protagonist (canon or OC). |
| **Story** | XML-tag streaming — narrate / act / say / think / system panels render as the model writes. Per-turn `<scene mood beat>` retunes the backdrop and ambient audio. AI emits 3 quick-action chips below each turn. |
| **Characters** | Avatar pipeline: AniList canon match → Google Nano Banana 2 (if Google API key set) → Pollinations.ai free fallback → procedural sigil. Per-NPC `register` + `tic` to keep voices distinct. |
| **HUD** | 6 widget types (stat-bar, stat-number, tag-list, affinity, inventory, note) — AI invents the schema fitting your genre, then mutates it inline via `<hud op="…"/>` tags. |
| **Memory** | Auto-pinned crystals for irreversible beats. Auto-summarization compresses old turns into context summaries when the prompt grows past ~5500 tokens. |
| **Providers** | Anthropic, OpenAI, Google Gemini, OpenRouter, DeepSeek, Mistral, Groq, xAI, Together, Cerebras, Z.AI, Ollama. Aggressive cross-provider prompt caching (~85-95% hit rate after turn 2). Multi-provider fallback chain — if your primary 402's, the fallback takes over automatically. |
| **Editor mode** | 🔄 Retry a turn. ✏️ Edit any committed panel inline. 🔖 Bookmark + branch + restore save points. World Bible / HUD / protagonist editor in a 3-tab drawer. |
| **Polish** | Procedural Web Audio ambient with 8 genre presets. Mood-tinted backdrop. Manga-style panels. Typewriter text reveal with click-to-skip. Bilingual UI (Vietnamese / English). |

---

## Stack

- **Shell**: Tauri 2 (Rust)
- **Frontend**: React 19 + TypeScript + Vite 7 + Tailwind CSS v4
- **State**: Zustand + Tauri LazyStore (persisted JSON in `%APPDATA%`)
- **Streaming**: SSE + NDJSON, custom XML-tag parser that flushes panels live
- **Audio**: Web Audio API (zero asset weight, zero copyright)
- **Image gen**: AniList GraphQL + Pollinations.ai + Google Gemini 2.5 Flash Image (Nano Banana 2)

---

## Run it

**Prerequisites**: [Rust toolchain](https://rustup.rs/), Node 18+, Windows / macOS / Linux.

```bash
# Dev (HMR + Tauri window)
dev.bat        # Windows
npm install --legacy-peer-deps && npm run tauri dev   # cross-platform

# Production bundle
build.bat      # Windows → .msi + .exe + NSIS in src-tauri/target/release/bundle/
npm run tauri build   # cross-platform
```

> The `--legacy-peer-deps` flag is **required** because Tailwind v4 has a peer-dep conflict with Vite 7.

### First-run setup

1. Launch the app → Settings (gear icon, bottom of side rail)
2. Pick a provider, paste your API key
3. *(Optional)* Set a fallback provider — the app will switch automatically if the primary fails
4. *(Optional, recommended)* Add a Google API key to unlock **Nano Banana 2** for high-quality avatar generation
5. Close Settings → click any of the 4 source cards on the landing screen → start your campaign

### Where data lives

| Data | Location | Notes |
|---|---|---|
| Settings (API keys, model choices, UI prefs) | `%APPDATA%\com.asus1.isekai\settings.json` | Plaintext today. Stronghold encryption is on the roadmap. |
| Campaigns | `%APPDATA%\com.asus1.isekai\campaigns.json` | Indexed under `c:<id>` + a summary index for the library list. Keep this file to back up your stories. |

---

## Bring-your-own keys

The app calls AI providers directly from your machine — no relay server, no telemetry. You own the keys, you pay the bills, and your campaigns never leave the device.

| Provider | Why |
|---|---|
| **Anthropic** Claude Sonnet/Opus | Best prose quality. Explicit prompt caching → cheapest on long campaigns. |
| **Google Gemini** 2.5 Pro/Flash | Free implicit caching. Long context. Pairs with Nano Banana 2 for image gen. |
| **OpenRouter** | Single key for many models. Routes to Anthropic / Gemini / OpenAI / DeepSeek / etc. |
| **DeepSeek** V3 | Cheapest competent prose. Auto prefix cache. |
| **Ollama** | Run a local model (no API cost, private). |

Free-tier-friendly combos:

- **Gemini Flash** primary + **DeepSeek** fallback → ~$0/month for casual play
- **OpenRouter** with `auto` model + **Ollama** fallback → automatic best-of routing with offline safety net

---

## Cost reality check

After **Phase 6 caching** (April 2026), a 30-turn campaign on Anthropic / Gemini / OpenRouter→Claude bills roughly:

| Phase | Effective input tok/turn (avg) | What you pay relative to no caching |
|---|---|---|
| Turn 1 (cache write) | ~3,500 | ~125% (cache write surcharge) |
| Turn 2-30 (cache read) | ~700-1,400 | ~10-15% |

The token usage chip on the topbar shows live `↑input ↓output 🔁cached%` so you can watch it work.

---

## Documentation

- **[HANDOFF.md](./HANDOFF.md)** — full architectural snapshot, file map, design decisions, roadmap. Read this first if you're picking up the project.
- **[progress.txt](./progress.txt)** — quick scratchpad of what's done / what's next / known bugs.

---

## Project status

🟢 Daily-driver usable. TypeScript clean. Rust shell builds.

⚠️ Pre-1.0:

- API keys still stored plaintext (Stronghold encryption roadmap'd)
- Default Tauri icon (no real branding asset yet)
- WorldEditView can't re-edit avatars after creation
- Retry doesn't roll back HUD ops (HP delta would re-apply)

See HANDOFF.md → "Known issues / Roadmap" for the full list and recommended priority order.

---

## License

Personal project. Not yet licensed for redistribution. If you want to use this seriously, open an issue first and we'll figure something out.

---

## Acknowledgements

- **AniList** — free GraphQL API for canon character images
- **Pollinations.ai** — free anonymous image generation
- **Google** — Gemini 2.5 Flash Image ("Nano Banana 2")
- **Tauri** team — for making "Electron but Rust + native" actually pleasant to ship
- The roleplay text-adventure tradition — AI Dungeon, KoboldAI, NovelAI, etc. — for showing what's possible
