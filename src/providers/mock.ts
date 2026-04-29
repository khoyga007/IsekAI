/**
 * Mock provider — fakes a streaming AI response so the app can be tested
 * end-to-end without touching any paid API. No network calls.
 *
 * Response shape is auto-detected from the system prompt:
 *   - "World Architect"   → returns a stub WorldBible JSON
 *   - "HUDs for IsekAI"   → returns a stub HudSchema JSON
 *   - "protagonist for an IsekAI" → returns a stub Protagonist JSON
 *   - "Game Master"       → returns story XML (the bulk of test traffic)
 *   - everything else     → short summary text
 *
 * The selected "model" picks a story scenario:
 *   mock:happy        — balanced normal turn
 *   mock:combat       — action turn with HP delta + dice
 *   mock:slow         — same as happy but ~25 chars/s (typewriter test)
 *   mock:fast         — instant emit (no streaming delay)
 *   mock:broken       — throws BEFORE first chunk (tests fallback chain)
 *   mock:broken-mid   — throws AFTER 100 chars (tests no-fallback rule)
 *   mock:long         — emits ~6000 chars to trigger context compression
 */
import type { Provider, ProviderConfig, ChatRequest, ChatChunk, ChatMessage } from "./types";
import { ProviderError } from "./types";

type Scenario = "happy" | "combat" | "slow" | "fast" | "broken" | "broken-mid" | "long" | "op" | "tier0";

function modelScenario(model: string): Scenario {
  const m = model.replace(/^mock:/, "");
  if (m === "combat" || m === "slow" || m === "fast" || m === "broken" || m === "broken-mid" || m === "long" || m === "op" || m === "tier0") return m;
  return "happy";
}

function detectKind(messages: ChatMessage[]): "bible" | "hud" | "protagonist" | "story" | "summary" {
  const sys = messages.filter(m => m.role === "system").map(m => m.content).join("\n");
  if (/World Architect/i.test(sys)) return "bible";
  if (/HUDs for IsekAI/i.test(sys)) return "hud";
  if (/protagonist for an IsekAI/i.test(sys)) return "protagonist";
  if (/Game Master/i.test(sys)) return "story";
  return "summary";
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Yield a string char-by-char, in groups, at a target characters-per-second. */
async function* streamText(text: string, charsPerSec: number, signal?: AbortSignal): AsyncGenerator<ChatChunk> {
  if (charsPerSec <= 0) {
    yield { delta: text };
    return;
  }
  const chunkSize = Math.max(1, Math.round(charsPerSec / 30));   // ~30 chunks/sec
  const delayMs = Math.round((1000 * chunkSize) / charsPerSec);
  for (let i = 0; i < text.length; i += chunkSize) {
    if (signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
    yield { delta: text.slice(i, i + chunkSize) };
    if (delayMs > 0) await sleep(delayMs);
  }
}

/* ---------- Canned JSON payloads (worldBuilder phase) ---------- */

const STUB_BIBLE = JSON.stringify({
  title: "Vương Đô Verdant",
  genre: "isekai-fantasy",
  tone: "hopeful",
  setting:
    "Mưa phùn rơi trên những mái ngói xanh rêu của Verdant — một thành đô cổ nằm giữa rừng già và biển sương. Lễ hội mùa thu vừa khép, những chiếc đèn lồng giấy còn lủng lẳng dọc cầu đá. Đâu đó trong các ngõ hẹp, mùi súp cá nướng quyện với khói nến cúng tổ. " +
    "Verdant thịnh vượng nhờ giao thương với các bộ lạc rừng sâu, nhưng phía bắc, Đế quốc Băng đang chầm chậm tiến quân. Người dân cười nói như chưa có chuyện gì, song mỗi sáng có thêm một chiến binh trẻ đeo kiếm rời cổng thành.",
  rules: [
    "Phép thuật rút năng lượng từ 'mạch ngọc' chảy ngầm dưới đất — dùng quá đà gây kiệt sức 3 ngày.",
    "Mọi cư dân Verdant đều có một 'dấu ấn' xuất hiện ở tuổi 15, định hướng nghề nghiệp.",
    "Đế quốc Băng tin rằng mạch ngọc là dị giáo và phải bị phong ấn.",
  ],
  factions: [
    { name: "Hội Đồng Lá Bạc", desc: "Tầng lớp trị vì Verdant, gồm 7 trưởng lão chọn ra từ các phường nghề." },
    { name: "Đoàn Lữ Hành Sương Mai", desc: "Thương đoàn lớn nhất, kiểm soát đường ngang biển." },
    { name: "Quân Đoàn Băng Trắng", desc: "Mũi nhọn của Đế quốc Băng, lạnh lùng và tổ chức như cỗ máy." },
  ],
  keyCharacters: [
    { name: "Lyra", role: "Nữ chiến binh trẻ, dấu ấn lưỡi kiếm bạc", desc: "Mới 19 tuổi nhưng đã đứng đầu đội tuần biên. Cô không tin định mệnh.", register: "terse", tic: "thường kết câu bằng '... cũng được.'" },
    { name: "Ông Marrow", role: "Chủ quán trọ Đèn Lồng Đỏ", desc: "Cựu binh giấu mình. Biết tất cả tin đồn trong thành.", register: "rustic", tic: "gọi mọi người là 'nhóc'" },
    { name: "Thân Vương Calder", role: "Tướng quân Đế quốc Băng", desc: "Lịch thiệp đến đáng sợ. Tin rằng diệt mạch ngọc là cứu rỗi.", register: "formal", tic: "luôn xưng 'tại hạ'" },
  ],
});

const STUB_HUD = JSON.stringify({
  genre: "isekai-fantasy",
  widgets: [
    { id: "hp", type: "stat-bar", label: "Sinh Lực", value: 80, max: 100, accent: "vermillion", icon: "heart" },
    { id: "mp", type: "stat-bar", label: "Mạch Ngọc", value: 45, max: 60, accent: "azure", icon: "zap" },
    { id: "status", type: "tag-list", label: "Trạng thái", tags: ["khoẻ", "ướt mưa"], accent: "jade" },
    { id: "bag", type: "inventory", label: "Hành trang", items: [{ name: "Bánh mì lúa mạch", qty: 2 }, { name: "Đồng xu bạc", qty: 12 }], accent: "gold" },
    { id: "bond", type: "affinity", label: "Quan hệ", values: { Lyra: 5, Marrow: 10 }, accent: "rose" },
    { id: "note", type: "note", label: "Ghi chú", body: "Mới đến Verdant trong cơn mưa phùn." },
  ],
});

const STUB_PROTAG = JSON.stringify({
  name: "Arthon",
  role: "Original Character",
  description:
    "Một thanh niên 22 tuổi, dáng người gầy nhưng dẻo dai, mặc chiếc áo khoác xám bạc màu của thế giới cũ. Anh tỉnh dậy bên hồ sương lúc rạng đông, không nhớ mình đến đây bằng cách nào — chỉ biết tay phải vẫn còn nắm chặt một mảnh thuỷ tinh khắc dấu lạ. Trầm tính, quan sát kỹ trước khi hành động.",
});

/* ---------- Canned XML story scenes ---------- */

function storyScene(scenario: Scenario, lastUser: string): string {
  // Tiny variation on user input so it feels reactive
  const echo = lastUser.slice(0, 60).replace(/\n+/g, " ").trim() || "(không nói gì)";

  if (scenario === "combat") {
    return `<scene mood="tense" beat="action"/>
<narrate>Lưỡi kiếm của Arthon vung lên giữa làn mưa, ánh thép loé lên như chớp. Tên cướp lùi nửa bước, gầm gừ.</narrate>
<say speaker="Tên cướp">Mày... không phải dân Verdant!</say>
<act>Arthon xoay cổ tay, ép sát đối thủ vào tường đá ướt.</act>
<hud op="delta" id="hp" value="-8"/>
<hud op="tag-add" id="status" value="chảy máu"/>
<crystal title="Cận chiến đầu tiên" summary="Arthon bị tên cướp ven cảng phục kích sau khi đáp lại '${echo}'. Bị thương nhẹ nhưng giành thế thượng phong."/>
<suggest>Tước vũ khí và thẩm vấn</suggest>
<suggest>Để hắn chạy, theo dõi từ xa</suggest>
<suggest>Hô hoán gọi tuần biên</suggest>`;
  }

  if (scenario === "op") {
    return `<scene mood="triumphant" beat="action"/>
<narrate>Arthon thở dài. Anh không muốn dùng sức thật, nhưng đám lính Băng Trắng vây quanh đã không cho anh lựa chọn. Một cái phất tay — ngắn gọn, gần như uể oải.</narrate>
<act>Không khí dồn nén trong nửa giây. Sau đó, toàn bộ ba mươi tay giáp sắt cùng lúc bay ngược về phía cổng thành, va vào tường đá rồi trượt xuống, ngất lịm.</act>
<say speaker="Arthon">Lần sau đừng đứng gần thế. Tay tôi nặng.</say>
<narrate>Lyra đứng nhìn, miệng há ra rồi ngậm lại. Cô không biết phải nói gì. Trên cao, những ngọn đèn lồng vẫn đung đưa như chưa có chuyện gì xảy ra.</narrate>
<say speaker="Lyra">... Anh là cái gì vậy?</say>
<hud op="set" id="hp" value="100"/>
<hud op="tag-add" id="status" value="chưa đổ một giọt mồ hôi"/>
<crystal title="Quá mạnh" summary="Arthon hạ ba mươi lính Băng Trắng bằng một cái phất tay sau khi nói '${echo}'. Lyra bắt đầu nghi ngờ anh không phải người thường."/>
<suggest>Trấn an Lyra, giả vờ là may mắn</suggest>
<suggest>Thừa nhận một phần sự thật</suggest>
<suggest>Bỏ đi không giải thích</suggest>`;
  }

  if (scenario === "tier0") {
    return `<scene mood="eerie" beat="introspection"/>
<narrate>Arthon ngừng bước. Mưa Verdant đông cứng giữa không trung — từng giọt treo lơ lửng như những viên pha lê không rơi. Tiếng cười từ quán trọ bị cắt giữa câu, kéo dài thành một nốt trầm vô hạn.</narrate>
<think>Đã lâu rồi mình không để mọi thứ chậm lại như vậy.</think>
<act>Anh đưa tay chạm vào một giọt mưa. Nó tan thành ý niệm — không phải nước, không phải hơi, mà là khái niệm "rơi xuống" đang chờ được cho phép tồn tại.</act>
<narrate>Ở đâu đó, ngoài lớp vỏ thực tại Verdant, có một thứ đang quan sát Arthon quan sát chính nó. Hai cái nhìn gặp nhau trong một khoảnh khắc dài bằng cả vũ trụ này.</narrate>
<say speaker="???">Ngươi lại đến đây nữa rồi, kẻ-không-có-tên. Lần này định sống được bao lâu?</say>
<say speaker="Arthon">Đủ lâu để uống hết một bát súp cá.</say>
<act>Arthon thả ngón tay. Mưa rơi tiếp. Tiếng cười trong quán trọ tiếp diễn như chưa từng ngắt. Marrow tựa cửa, không biết rằng vài giây vừa rồi đã không tồn tại.</act>
<hud op="tag-add" id="status" value="vừa nói chuyện với một thứ ngoài thực tại"/>
<crystal title="Khoảnh khắc đứng yên" summary="Arthon dừng thời gian Verdant trong vài giây sau khi nói '${echo}'. Một thực thể ngoài thế giới này gọi anh là 'kẻ-không-có-tên'. Marrow không nhận thấy gì."/>
<suggest>Đi về quán trọ, ăn súp như chưa có chuyện gì</suggest>
<suggest>Tìm cách liên lạc lại với 'thứ' đó</suggest>
<suggest>Rời Verdant trước khi nó nhận ra anh là ai</suggest>`;
  }

  if (scenario === "long") {
    // Repeat a calm turn 4× to inflate token count for compression test.
    const block = `<narrate>Buổi chiều ở Verdant trôi chậm như sương buông trên ngói. Arthon đi dọc bờ kênh, quan sát những chiếc thuyền nan chở cá hồi về cảng. Mỗi mái chèo khuấy mặt nước tạo nên một vòng sáng nhỏ, rồi tan.</narrate>
<say speaker="Ông Marrow">Nhóc lại đi dạo nữa hả? Cẩn thận đám đầu trộm đuôi cướp ở khu Cửa Đông đấy.</say>
<narrate>Người chủ quán trọ tựa vào khung cửa, miệng ngậm tẩu, mắt dõi theo chàng trai trẻ. Trong đôi mắt đầy nếp nhăn ấy có gì đó không hẳn là lo lắng — gần với hoài niệm hơn.</narrate>
<act>Arthon gật đầu, chỉnh lại đai kiếm rồi tiếp tục bước. Mảnh thuỷ tinh trong túi áo nhói lên một cái — rất khẽ, như nhịp tim của ai đó xa lạ.</act>`;
    return `<scene mood="cozy" beat="downtime"/>
${block}
${block}
${block}
${block}
<hud op="delta" id="mp" value="+5"/>
<crystal title="Chiều dài ở Verdant" summary="Arthon đi dạo cảng cá, gặp lại ông Marrow. Mảnh thuỷ tinh phản ứng yếu — gợi ý nó cộng hưởng với mạch ngọc."/>
<suggest>Hỏi Marrow về mảnh thuỷ tinh</suggest>
<suggest>Tới khu Cửa Đông xem sao</suggest>
<suggest>Quay về quán trọ nghỉ</suggest>`;
  }

  // happy / slow / fast / broken-mid all share the same content
  return `<scene mood="calm" beat="downtime"/>
<narrate>Quán trọ Đèn Lồng Đỏ ấm áp lạ thường sau cơn mưa. Arthon kéo ghế ngồi xuống, mảnh thuỷ tinh trong túi áo vẫn còn lạnh.</narrate>
<say speaker="Ông Marrow">Nhóc mới đến thành à? Trông mặt mũi không giống dân quanh đây.</say>
<think>Liệu có nên kể thật?</think>
<say speaker="Arthon">${echo}</say>
<act>Marrow rót một bát súp cá nóng, đẩy về phía Arthon mà không hỏi giá.</act>
<hud op="delta" id="hp" value="+3"/>
<hud op="affinity" id="bond" value="Marrow:+2"/>
<crystal title="Bữa súp đầu tiên" summary="Arthon được ông Marrow ở quán Đèn Lồng Đỏ tiếp đãi miễn phí sau khi nói '${echo}'."/>
<suggest>Hỏi Marrow về mảnh thuỷ tinh</suggest>
<suggest>Lặng lẽ ăn rồi quan sát</suggest>
<suggest>Hỏi đường đến Hội Đồng Lá Bạc</suggest>`;
}

/* ---------- Provider impl ---------- */

export const mock: Provider = {
  id: "mock",
  label: "Mock (Dev — no API)",
  needsKey: false,
  defaultModels: [
    { id: "mock:happy", label: "Happy", hint: "Balanced calm turn" },
    { id: "mock:combat", label: "Combat", hint: "Action + HP delta" },
    { id: "mock:slow", label: "Slow", hint: "~25 chars/s (typewriter)" },
    { id: "mock:fast", label: "Fast", hint: "Instant emit" },
    { id: "mock:broken", label: "Broken (pre-stream)", hint: "Throws before first chunk — tests fallback" },
    { id: "mock:broken-mid", label: "Broken (mid-stream)", hint: "Throws after 100 chars — no fallback" },
    { id: "mock:long", label: "Long", hint: "~6k chars — triggers compression" },
    { id: "mock:op", label: "OP (Saitama-style)", hint: "One-shot everything, comedic tone" },
    { id: "mock:tier0", label: "Tier 0 (Reality Warper)", hint: "Cosmic, philosophical, time-stop" },
  ],

  async *stream(req: ChatRequest, _cfg: ProviderConfig): AsyncGenerator<ChatChunk> {
    const scenario = modelScenario(req.model);
    const kind = detectKind(req.messages);
    const lastUser = [...req.messages].reverse().find(m => m.role === "user")?.content ?? "";

    // Fail-fast scenario — useful for testing the fallback chain.
    if (scenario === "broken") {
      await sleep(80);
      throw new ProviderError("mock" as any, 500, "mock:broken — simulated pre-stream failure");
    }

    // Pick payload + speed
    let payload: string;
    let cps: number;
    switch (kind) {
      case "bible":       payload = STUB_BIBLE;   cps = 0; break;     // JSON: emit instantly
      case "hud":         payload = STUB_HUD;     cps = 0; break;
      case "protagonist": payload = STUB_PROTAG;  cps = 0; break;
      case "summary":     payload = `Tóm tắt: Arthon đến Verdant trong mưa, gặp ông Marrow ở quán Đèn Lồng Đỏ, phát hiện mảnh thuỷ tinh phản ứng yếu với mạch ngọc của thành. Lyra chưa xuất hiện. Quan hệ với Marrow ấm dần.`; cps = 200; break;
      case "story":
      default:
        payload = storyScene(scenario, lastUser);
        cps = scenario === "fast" ? 0 : scenario === "slow" ? 25 : 180;
        break;
    }

    // Stream the payload, possibly aborting mid-way for broken-mid.
    let emitted = 0;
    for await (const ch of streamText(payload, cps, req.signal)) {
      if (scenario === "broken-mid" && kind === "story" && emitted >= 100) {
        throw new ProviderError("mock" as any, 500, "mock:broken-mid — simulated mid-stream failure");
      }
      emitted += ch.delta.length;
      yield ch;
    }

    // Fake usage stats. Pretend ~85% of input was cached.
    const inputTokens = Math.max(200, Math.round(JSON.stringify(req.messages).length / 4));
    const outputTokens = Math.max(20, Math.round(payload.length / 4));
    yield {
      delta: "",
      done: true,
      usage: {
        inputTokens,
        outputTokens,
        cachedTokens: Math.round(inputTokens * 0.85),
      },
    };
  },
};
