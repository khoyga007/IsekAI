const fs = require('fs');
const path = require('path');

const fileContent = fs.readFileSync(path.join(__dirname, 'src/engine/storyEngine.ts'), 'utf-8');

// Split sections based on known comment dividers
const parts = fileContent.split('/* ---------- ');

const preludeAndPrompt = parts[0];
const parserSection = '/* ---------- ' + parts[1];
const hudSection = '/* ---------- ' + parts[2];
const contextSection = '/* ---------- ' + parts[3];
const streamSection = '/* ---------- ' + parts[4];

// Further split contextSection into compressIfNeeded and formatInput / panelsToCompact / applyBibleAdds
const contextSplit = contextSection.split('export function formatInput');
const contextManagerContent = contextSplit[0];
const remainingUtils = 'export function formatInput' + contextSplit[1];

// 1. streamParser.ts
const streamParserCode = `import type { Campaign, Panel, PanelKind } from "@/state/types";

${parserSection}
${hudSection}
${remainingUtils}
`;

// 2. promptBuilder.ts
const promptBuilderCode = `import type { Campaign, PowerLevel } from "@/state/types";
import { useSettings } from "@/state/settings";
import { formatInput } from "./streamParser";

${preludeAndPrompt.replace('import { streamWithActive } from "./chat";\n', '').replace('import type { Campaign, Panel, PanelKind, PowerLevel } from "@/state/types";', '')}
`;

// 3. contextManager.ts
const contextManagerCode = `import { streamWithActive } from "../chat";
import type { Campaign } from "@/state/types";
import { buildSystemPrompt } from "./promptBuilder";
import { formatInput, panelsToCompact } from "./streamParser";

${contextManagerContent}
`;

// 4. storyEngine.ts
const storyEngineCode = `import { streamWithActive } from "./chat";
import type { Campaign } from "@/state/types";
import { parseStory, type ParsedDoc } from "./core/streamParser";
import { buildSystemPromptStable, buildSystemPromptDynamic } from "./core/promptBuilder";
import { compressIfNeeded } from "./core/contextManager";
import { formatInput, panelsToCompact } from "./core/streamParser";

${streamSection}

// Re-export everything so other files don't break
export * from "./core/promptBuilder";
export * from "./core/streamParser";
export * from "./core/contextManager";
`;

fs.writeFileSync(path.join(__dirname, 'src/engine/core/streamParser.ts'), streamParserCode);
fs.writeFileSync(path.join(__dirname, 'src/engine/core/promptBuilder.ts'), promptBuilderCode);
fs.writeFileSync(path.join(__dirname, 'src/engine/core/contextManager.ts'), contextManagerCode);
fs.writeFileSync(path.join(__dirname, 'src/engine/storyEngine.ts'), storyEngineCode);

console.log("Refactoring complete.");
