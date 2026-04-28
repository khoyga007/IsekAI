import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { Campaign, Panel } from "@/state/types";

/** Render a campaign as a single readable Markdown document. */
export function campaignToMarkdown(c: Campaign): string {
  const lines: string[] = [];
  lines.push(`# ${c.bible.title}`);
  lines.push(`*${c.bible.genre} · ${c.bible.tone}*`);
  lines.push("");
  lines.push(`> Played as **${c.protagonist.name}** — ${c.protagonist.role}`);
  lines.push(`> ${c.protagonist.description}`);
  lines.push("");
  lines.push("---");
  lines.push("## World");
  lines.push("");
  lines.push(c.bible.setting);
  lines.push("");
  if (c.bible.rules.length) {
    lines.push("### Rules");
    c.bible.rules.forEach(r => lines.push(`- ${r}`));
    lines.push("");
  }
  if (c.bible.factions.length) {
    lines.push("### Factions");
    c.bible.factions.forEach(f => lines.push(`- **${f.name}** — ${f.desc}`));
    lines.push("");
  }
  if (c.bible.keyCharacters.length) {
    lines.push("### Key Figures");
    c.bible.keyCharacters.forEach(k => lines.push(`- **${k.name}** *(${k.role})* — ${k.desc}`));
    lines.push("");
  }
  lines.push("---");
  lines.push("## Story");
  lines.push("");
  c.scenes.forEach((s) => {
    lines.push(`### Turn ${s.turn}`);
    if (s.playerInput) {
      const p = s.playerInput;
      const tag = p.mode === "say" ? "🗣" : p.mode === "do" ? "▸" : p.mode === "think" ? "💭" : "//";
      lines.push(`> ${tag} *${p.text}*`);
      lines.push("");
    }
    s.panels.forEach((pan) => lines.push(panelToMd(pan)));
    lines.push("");
  });
  if (c.crystals.length) {
    lines.push("---");
    lines.push("## Memory Crystals");
    lines.push("");
    c.crystals.forEach(m => lines.push(`- **T${m.turn} · ${m.title}** — ${m.summary}`));
  }
  return lines.join("\n");
}

function panelToMd(p: Panel): string {
  switch (p.kind) {
    case "narration": return `*${p.text}*\n`;
    case "action":    return `**▸** ${p.text}\n`;
    case "dialogue":  return `**${p.speaker ?? "???"}:** "${p.text}"\n`;
    case "thought":   return `*(${p.speaker ?? "thought"}: ${p.text})*\n`;
    case "system":    return `> ◇ ${p.text}\n`;
  }
}

/** Open a save dialog and write the campaign markdown to disk. */
export async function exportCampaign(c: Campaign): Promise<string | null> {
  const slug = c.bible.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const path = await save({
    title: "Export campaign as Markdown",
    defaultPath: `IsekAI-${slug}.md`,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  if (!path) return null;
  await writeTextFile(path, campaignToMarkdown(c));
  return path;
}
