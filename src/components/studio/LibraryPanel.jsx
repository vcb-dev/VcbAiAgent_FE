// Left pane (CapCut "media library"): tab bar + one page per tab.
import { setUi, useEditorStore } from "@/store/useEditorStore";
import { ICONS } from "./EditorIcons";
import ScriptTab from "./ScriptTab";
import FootageTab from "./FootageTab";
import { AiTab, AudioTab, EffectsTab, TextTab } from "./LibraryOptionTabs";

const TABS = [["script", "Kịch bản"], ["footage", "Footage"], ["audio", "Âm thanh"], ["text", "Văn bản"], ["effects", "Hiệu ứng"], ["ai", "AI"]];

function Page({ id, boot, job }) {
  switch (id) {
    case "script":
      return <ScriptTab boot={boot} job={job} />;
    case "footage":
      return <FootageTab boot={boot} job={job} />;
    case "audio":
      return <AudioTab boot={boot} job={job} />;
    case "text":
      return <TextTab boot={boot} job={job} />;
    case "effects":
      return <EffectsTab boot={boot} job={job} />;
    default:
      return <AiTab job={job} />;
  }
}

export default function LibraryPanel({ boot, job }) {
  const libTab = useEditorStore((s) => s.libTab);

  return (
    <section className="pane library">
      <nav className="lib-tabs">
        {boot &&
          TABS.map(([id, label]) => (
            <button
              key={id}
              className={`lib-tab${libTab === id ? " active" : ""}`}
              onClick={() => setUi({ libTab: id })}
            >
              {ICONS[id]}
              {label}
            </button>
          ))}
      </nav>
      <div className="lib-body">
        {boot &&
          TABS.map(([id]) => (
            <div key={id} className={`lib-page${libTab === id ? "" : " hidden"}`}>
              <Page id={id} boot={boot} job={job} />
            </div>
          ))}
      </div>
    </section>
  );
}
