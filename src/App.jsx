// Studio shell: bootstrap, the four panes, top-bar tabs and deep links (?job=&part=&shot=&lib=&insp=&zoom=&tab=).
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useBootstrap, useJob, useStudioActions } from "@/features/studio/useStudio";
import { setUi } from "@/store/useEditorStore";
import TopBar from "@/components/studio/TopBar";
import LibraryPanel from "@/components/studio/LibraryPanel";
import PlayerPane from "@/components/studio/PlayerPane";
import InspectorPanel from "@/components/studio/InspectorPanel";
import TimelinePane from "@/components/studio/TimelinePane";

// Loaded on the first click of the "So sánh model AI" tab, like the legacy dynamic import.
const AiModelsTab = lazy(() => import("@/components/models/AiModelsTab"));

export default function App() {
  const [searchParams] = useSearchParams();
  const { data: boot, error } = useBootstrap();
  const { data: job } = useJob();
  const actions = useStudioActions();
  const [tab, setTab] = useState("studio");
  const [modelsOpened, setModelsOpened] = useState(false);
  const deepLinked = useRef(false);

  const openTab = (next) => {
    setTab(next);
    if (next === "models") setModelsOpened(true);
  };

  useEffect(() => {
    if (deepLinked.current) return;
    deepLinked.current = true;
    const patch = {};
    if (searchParams.get("lib")) patch.libTab = searchParams.get("lib");
    if (searchParams.get("insp")) patch.inspTab = searchParams.get("insp");
    if (searchParams.get("part")) {
      patch.sel = { part: searchParams.get("part"), shot: Number(searchParams.get("shot") || 0) };
    }
    if (searchParams.get("zoom")) patch.zoom = Number(searchParams.get("zoom"));
    if (Object.keys(patch).length) setUi(patch);
    if (searchParams.get("job")) actions.load(searchParams.get("job"));
    if (searchParams.get("tab") === "models") openTab("models");
  }, [searchParams, actions]);

  return (
    <>
      {error ? <p style={{ color: "#e66767", padding: "12px" }}>Lỗi khởi động: {error.message}</p> : null}
      <TopBar boot={boot} job={job} tab={tab} onTab={openTab} />
      <main className={`editor${tab === "studio" ? "" : " hidden"}`}>
        <LibraryPanel boot={boot} job={job} />
        <PlayerPane job={job} />
        <InspectorPanel boot={boot} job={job} />
        <TimelinePane boot={boot} job={job} />
      </main>
      <main className={`models${tab === "models" ? "" : " hidden"}`}>
        {modelsOpened ? (
          <Suspense fallback={null}>
            <AiModelsTab />
          </Suspense>
        ) : null}
      </main>
    </>
  );
}
