import { useEffect, useState } from "react";
import { X, FileDown, Bookmark } from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Backdrop } from "@/components/Backdrop";
import { SideRail, type RailKey } from "@/components/SideRail";
import { TopBar } from "@/components/TopBar";
import { Stage } from "@/components/Stage";
import { InputBar } from "@/components/InputBar";
import { DynamicHud } from "@/components/DynamicHud";
import { ProviderBadge } from "@/components/ProviderBadge";
import { AudioToggle } from "@/components/AudioToggle";
import { SettingsPanel } from "@/components/SettingsPanel";
import { Onboarding } from "@/components/Onboarding";
import { Library } from "@/components/Library";
import { CastView } from "@/components/CastView";
import { MemoryView } from "@/components/MemoryView";
import { SavesView } from "@/components/SavesView";
import { WorldEditView } from "@/components/WorldEditView";
import { useSettings } from "@/state/settings";
import { useCampaign } from "@/state/campaign";
import type { SourceKind } from "@/state/types";
import { exportCampaign } from "@/lib/export";
import { useT } from "@/lib/i18n";

type Drawer = "library" | "worldedit" | "cast" | "memory" | "saves" | "settings" | null;

export default function App() {
  const t = useT();
  const [active, setActive] = useState<RailKey>("new");
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [onboardKind, setOnboardKind] = useState<SourceKind>("title");

  const hydrateSettings = useSettings((s) => s.hydrate);
  const hydratedSettings = useSettings((s) => s.hydrated);
  const hydrateCampaign = useCampaign((s) => s.hydrate);
  const closeCampaign = useCampaign((s) => s.closeCampaign);
  const bookmark = useCampaign((s) => s.bookmark);
  const campaign = useCampaign((s) => s.current);

  const lang = useSettings((s) => s.ui.lang);

  useEffect(() => {
    void hydrateSettings();
    void hydrateCampaign();
  }, [hydrateSettings, hydrateCampaign]);

  // Keep <html lang> in sync with the active locale so the browser
  // serves the correct Google Fonts subset (vietnamese vs latin-ext).
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Side rail dispatch — each item maps to either a drawer or the new-campaign modal.
  useEffect(() => {
    if (active === "new") {
      if (!campaign) { /* landing page already visible */ }
      else setDrawer("library");
    } else if (active === "world") {
      setDrawer(campaign ? "worldedit" : "library");
    } else if (active === "characters") {
      setDrawer("cast");
    } else if (active === "story") {
      if (!campaign) { setDrawer(null); setOnboardKind("title"); setOnboardOpen(true); }
      else setDrawer(null);
    } else if (active === "memory") {
      setDrawer("memory");
    } else if (active === "saves") {
      setDrawer("saves");
    } else if (active === "settings") {
      setDrawer("settings");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!hydratedSettings) {
    return (
      <div className="h-screen w-screen grid place-items-center bg-ink-wash">
        <div className="font-display text-5xl font-bold animate-pulse" style={{ color: "var(--color-vermillion)" }}>i</div>
      </div>
    );
  }

  const openSeed = (k: SourceKind) => { setOnboardKind(k); setOnboardOpen(true); };
  const closeDrawer = () => setDrawer(null);

  const onQuickBookmark = async () => {
    if (!campaign) return;
    const label = prompt(t("saves.create.placeholder"), `Turn ${campaign.scenes.length}`);
    if (label === null) return;
    await bookmark(label);
    setDrawer("saves");
  };

  return (
    <div className="relative h-screen w-screen flex">
      <Backdrop />

      <div className="relative z-10 flex w-full">
        <SideRail active={active} onChange={setActive} />

        <div className="hairline-v h-full" />

        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex items-start justify-between pr-6 pt-5 gap-3">
            <div className="flex-1">
              <TopBar
                chapter={campaign ? `${t("header.chapter")} · ${String(campaign.scenes.length).padStart(2, "0")}` : t("header.prologue")}
                title={campaign ? campaign.bible.title : t("header.blank")}
                subtitle={campaign ? `${campaign.protagonist.name} — ${campaign.protagonist.role}` : t("header.subtitle")}
              />
            </div>
            <div className="pt-1 flex items-center gap-2">
              {campaign && (
                <>
                  <button
                    onClick={onQuickBookmark}
                    className="grid place-items-center w-9 h-9 rounded-full glass hover:glass-hi transition"
                    title={t("btn.bookmark")}
                  >
                    <Bookmark size={14} />
                  </button>
                  <button
                    onClick={() => exportCampaign(campaign).catch(console.error)}
                    className="grid place-items-center w-9 h-9 rounded-full glass hover:glass-hi transition"
                    title={t("btn.export")}
                  >
                    <FileDown size={14} />
                  </button>
                  <button
                    onClick={() => { if (confirm(t("confirm.close"))) closeCampaign(); }}
                    className="grid place-items-center w-9 h-9 rounded-full glass hover:glass-hi transition"
                    title={t("btn.close")}
                  >
                    <X size={14} />
                  </button>
                </>
              )}
              <AudioToggle />
              <ProviderBadge onClick={() => setDrawer("settings")} />
            </div>
          </div>
          <ErrorBoundary inline label={t("err.panel.story")} resetKey={campaign?.id ?? "none"}>
            <Stage onSeed={openSeed} />
          </ErrorBoundary>
          <InputBar />
        </main>

        <div className="hairline-v h-full" />

        <ErrorBoundary inline label={t("err.panel.hud")} resetKey={campaign?.id ?? "none"}>
          <DynamicHud />
        </ErrorBoundary>
      </div>

      <SettingsPanel open={drawer === "settings"} onClose={closeDrawer} />
      <Library open={drawer === "library"} onClose={closeDrawer} onNew={() => openSeed("title")} />
      <CastView open={drawer === "cast"} onClose={closeDrawer} />
      <MemoryView open={drawer === "memory"} onClose={closeDrawer} />
      <SavesView open={drawer === "saves"} onClose={closeDrawer} />
      <WorldEditView open={drawer === "worldedit"} onClose={closeDrawer} />
      <Onboarding
        open={onboardOpen}
        initialKind={onboardKind}
        onClose={() => setOnboardOpen(false)}
        onOpenSettings={() => { setOnboardOpen(false); setDrawer("settings"); }}
      />
    </div>
  );
}

export function WrappedApp() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
