# IsekAI

> **Bước vào bất kỳ manga, light novel nào, hay thế giới do chính bạn tạo ra.**
> App roleplay AI desktop — nửa game, nửa studio viết truyện.

`vô vàn câu chuyện` · infinite tales

🌐 [English](./README.md) · **Tiếng Việt**

---

## App này là gì?

IsekAI là **engine roleplay AI desktop** xoay quanh một ý tưởng đơn giản: bạn đặt tên một manga hoặc mô tả một thế giới, AI Game Master sẽ viết câu chuyện theo phong cách manga panel cùng bạn, từng lượt một. Có thể chơi như AI Dungeon, có thể chỉnh sửa như writing tool, và mỗi cảnh stream live với avatar nhân vật, backdrop nhuốm theo mood, âm thanh procedural và HUD tự thích ứng theo thể loại.

App được thiết kế cho người muốn cả hai:

- **đắm chìm** trong câu chuyện (panels, bubble thoại, avatar, audio)
- **kiểm soát** như editor (retry GM khi viết dở, sửa câu sai canon, branch save point, đổi provider khi hết credit)

---

## Điểm nổi bật

| Khu vực | Tính năng |
|---|---|
| **Thế giới** | 4 nguồn — tựa có sẵn, tự mô tả, link Wiki/Fandom, surprise-me. AI dựng World Bible (thể loại, giọng điệu, quy luật, phe phái, cast chính) + HUD theo thể loại + nhân vật chính (canon hoặc OC). |
| **Truyện** | Stream theo XML tag — narrate / act / say / think / system panels render khi model viết. `<scene mood beat>` mỗi turn retunes backdrop và ambient audio. AI gợi ý 3 chip hành động dưới mỗi cảnh. |
| **Nhân vật** | Pipeline avatar: AniList canon match → Google Nano Banana 2 (nếu có Google API key) → Pollinations.ai miễn phí → sigil procedural. Mỗi NPC có `register` + `tic` riêng để giữ giọng khác biệt. |
| **HUD** | 6 loại widget (stat-bar, stat-number, tag-list, affinity, inventory, note) — AI tự thiết kế schema phù hợp thể loại, sau đó cập nhật inline qua tag `<hud op="…"/>`. |
| **Ký ức** | Tinh thể (crystal) auto-pin cho các nhịp irreversible. Auto-summary nén các turn cũ vào context summary khi prompt vượt ~5500 tokens. |
| **Provider** | Anthropic, OpenAI, Google Gemini, OpenRouter, DeepSeek, Mistral, Groq, xAI, Together, Cerebras, Z.AI, Ollama. Caching mạnh tay (~85-95% hit rate sau turn 2). Fallback chain — nếu primary 402, fallback tự động take over. |
| **Editor mode** | 🔄 Retry turn. ✏️ Sửa panel đã commit inline. 🔖 Bookmark + branch + restore save point. World Bible / HUD / Protagonist editor trong drawer 3 tab. |
| **Polish** | Procedural Web Audio với 8 preset thể loại. Backdrop nhuốm mood. Manga-style panels. Typewriter reveal click-to-skip. UI song ngữ (Việt/Anh). |

---

## Stack công nghệ

- **Shell**: Tauri 2 (Rust)
- **Frontend**: React 19 + TypeScript + Vite 7 + Tailwind CSS v4
- **State**: Zustand + Tauri LazyStore (JSON persist trong `%APPDATA%`)
- **Streaming**: SSE + NDJSON, parser XML-tag custom flush panels live
- **Audio**: Web Audio API (zero asset, zero bản quyền)
- **Image gen**: AniList GraphQL + Pollinations.ai + Google Gemini 2.5 Flash Image (Nano Banana 2)

---

## Cách chạy

**Yêu cầu**: [Rust toolchain](https://rustup.rs/), Node 18+, Windows / macOS / Linux.

```bash
# Dev (HMR + cửa sổ Tauri)
dev.bat        # Windows
npm install --legacy-peer-deps && npm run tauri dev   # cross-platform

# Bundle production
build.bat      # Windows → .msi + .exe + NSIS trong src-tauri/target/release/bundle/
npm run tauri build   # cross-platform
```

> Cần `--legacy-peer-deps` vì Tailwind v4 conflict peer-dep với Vite 7.

### Setup lần đầu

1. Mở app → Settings (icon bánh răng dưới side rail)
2. Chọn provider, dán API key
3. *(Tùy chọn)* Đặt fallback provider — app tự switch khi primary fail
4. *(Khuyến nghị)* Thêm Google API key để mở khóa **Nano Banana 2** sinh avatar chất lượng cao
5. Đóng Settings → click 1 trong 4 thẻ trên màn hình landing → bắt đầu campaign

### Dữ liệu lưu ở đâu

| Dữ liệu | Vị trí | Ghi chú |
|---|---|---|
| Settings (API keys, model, prefs UI) | `%APPDATA%\com.asus1.isekai\settings.json` | Hiện đang plaintext. Stronghold encryption nằm trong roadmap. |
| Campaigns | `%APPDATA%\com.asus1.isekai\campaigns.json` | Indexed dưới `c:<id>` + summary index cho library. Backup file này nếu muốn giữ truyện. |

---

## Bring-your-own keys

App gọi AI provider trực tiếp từ máy bạn — không relay server, không telemetry. Bạn giữ key, bạn trả tiền, và campaign không bao giờ rời khỏi máy.

| Provider | Vì sao chọn |
|---|---|
| **Anthropic** Claude Sonnet/Opus | Prose chất lượng nhất. Explicit prompt caching → rẻ nhất với campaign dài. |
| **Google Gemini** 2.5 Pro/Flash | Implicit caching miễn phí. Context dài. Pair với Nano Banana 2 cho image gen. |
| **OpenRouter** | Một key dùng nhiều model. Routes đến Anthropic / Gemini / OpenAI / DeepSeek / etc. |
| **DeepSeek** V3 | Prose tử tế rẻ nhất. Auto prefix cache. |
| **Ollama** | Chạy model local (không tốn API, riêng tư). |

Combo thân thiện free-tier:

- **Gemini Flash** primary + **DeepSeek** fallback → ~$0/tháng cho chơi casual
- **OpenRouter** với model `auto` + **Ollama** fallback → routing tự động + offline safety net

---

## Reality check chi phí

Sau **Phase 6 caching** (April 2026), một campaign 30-turn trên Anthropic / Gemini / OpenRouter→Claude sẽ tốn xấp xỉ:

| Phase | Effective input tok/turn (avg) | Trả tương đối khi không có cache |
|---|---|---|
| Turn 1 (cache write) | ~3,500 | ~125% (phụ phí cache write) |
| Turn 2-30 (cache read) | ~700-1,400 | ~10-15% |

Chip token usage trên topbar hiển thị live `↑input ↓output 🔁cached%` để bạn quan sát caching đang chạy.

---

## Tài liệu

- **[HANDOFF.md](./HANDOFF.md)** — snapshot kiến trúc đầy đủ, file map, design decisions, roadmap. Đọc cái này đầu tiên nếu bạn pick up project.
- **[progress.txt](./progress.txt)** — scratchpad nhanh: đã làm / sắp làm / known bugs.

---

## Trạng thái dự án

🟢 Daily-driver dùng được. TypeScript clean. Rust shell build OK.

⚠️ Pre-1.0:

- API key vẫn plaintext (Stronghold encryption nằm trong roadmap)
- Icon Tauri default (chưa có asset branding thật)
- WorldEditView chưa edit avatar được sau khi tạo
- Retry không rollback HUD ops (HP delta sẽ áp dụng 2 lần)

Xem HANDOFF.md → "Known issues / Roadmap" để có danh sách đầy đủ + thứ tự ưu tiên.

---

## License

Project cá nhân. Chưa có license cho phân phối lại. Nếu muốn dùng nghiêm túc, mở issue trước rồi bàn.

---

## Cảm ơn

- **AniList** — GraphQL API miễn phí cho ảnh canon character
- **Pollinations.ai** — image generation ẩn danh miễn phí
- **Google** — Gemini 2.5 Flash Image ("Nano Banana 2")
- **Tauri** team — vì đã làm "Electron nhưng Rust + native" trở nên dễ ship
- Truyền thống text-adventure roleplay — AI Dungeon, KoboldAI, NovelAI, etc. — vì đã chỉ ra điều gì là khả thi
