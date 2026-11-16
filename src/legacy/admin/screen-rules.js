// Cấu hình quy tắc: content (5A / A4A5 / ngoài VN) và dựng A4. Lưu xong job tự động lần sau ăn bản mới.
import { api, esc, toast } from "./admin-api.js";

const TABS = [
  ["content", "Quy tắc content"],
  ["a4", "Quy tắc A4"],
];

function tagVal(v) {
  return Array.isArray(v) ? v.join(", ") : String(v ?? "");
}

function fieldHtml(rule, f) {
  const name = `${rule.code}.${f.key}`;
  if (f.type === "check") {
    return `<label class="rule-check"><input type="checkbox" data-p="${esc(rule.code)}" data-k="${esc(f.key)}" ${f.value ? "checked" : ""}> ${esc(f.label)}</label>`;
  }
  if (f.type === "tags") {
    return `<label class="rule-f"><span>${esc(f.label)}</span>
      <textarea class="in" rows="2" data-p="${esc(rule.code)}" data-k="${esc(f.key)}" data-tags="1">${esc(tagVal(f.value))}</textarea>
      <span class="muted small">Cách nhau bằng dấu phẩy</span></label>`;
  }
  return `<label class="rule-f"><span>${esc(f.label)}</span>
    <input class="in" type="number" step="any" data-p="${esc(rule.code)}" data-k="${esc(f.key)}" value="${esc(f.value)}">
  </label>`;
}

function a4Html(a4) {
  return (a4.groups || []).map((g) => `<section class="rule-g">
      <h2>${esc(g.title)}</h2>
      ${g.rules.map((r) => `<article class="rule-card${r.enabled ? "" : " off"}" data-code="${esc(r.code)}">
        <div class="rule-hd">
          <label class="rtgl"><input type="checkbox" data-on="${esc(r.code)}" ${r.enabled ? "checked" : ""}><span>Bật</span></label>
          <div class="grow"><b>${esc(r.title)}</b><code class="mono muted">${esc(r.code)}</code></div>
        </div>
        <p class="rule-note">${esc(r.note)}</p>
        ${r.fields?.length ? `<div class="rule-fields">${r.fields.map((f) => fieldHtml(r, f)).join("")}</div>` : ""}
      </article>`).join("")}
    </section>`).join("");
}

function contentHtml(content) {
  return (content.docs || []).map((d) => `<section class="rule-g" data-doc="${esc(d.id)}">
      <h2>${esc(d.title)}</h2>
      <p class="muted small" style="margin:0 0 10px">${esc(d.hint)}</p>
      ${(d.sections || []).map((s, i) => `<article class="rule-card">
        <label class="rule-f"><span>Mục</span>
          <input class="in" data-doc="${esc(d.id)}" data-sec="${i}" data-k="heading" value="${esc(s.heading || "")}">
        </label>
        <label class="rule-f"><span>Nội dung</span>
          <textarea class="in rule-md" rows="${Math.min(18, Math.max(6, String(s.body || "").split("\n").length + 1))}"
            data-doc="${esc(d.id)}" data-sec="${i}" data-k="body">${esc(s.body || "")}</textarea>
        </label>
      </article>`).join("")}
    </section>`).join("");
}

function readA4(el, a4) {
  const built = {};
  for (const g of a4.groups || []) {
    for (const r of g.rules) {
      const on = el.querySelector(`[data-on="${CSS.escape(r.code)}"]`);
      const params = {};
      el.querySelectorAll(`[data-p="${CSS.escape(r.code)}"]`).forEach((inp) => {
        const k = inp.dataset.k;
        if (inp.type === "checkbox") params[k] = inp.checked;
        else if (inp.dataset.tags) params[k] = inp.value.split(",").map((x) => x.trim()).filter(Boolean);
        else {
          const n = Number(inp.value);
          params[k] = Number.isFinite(n) && inp.value !== "" ? n : inp.value;
        }
      });
      built[r.code] = { enabled: !!(on && on.checked), params };
    }
  }
  return built;
}

function readContent(el, content) {
  return (content.docs || []).map((d) => ({
    id: d.id,
    sections: (d.sections || []).map((s, i) => ({
      heading: el.querySelector(`[data-doc="${CSS.escape(d.id)}"][data-sec="${i}"][data-k="heading"]`)?.value || s.heading,
      body: el.querySelector(`[data-doc="${CSS.escape(d.id)}"][data-sec="${i}"][data-k="body"]`)?.value || s.body,
    })),
  }));
}

export async function render(view, ctx) {
  const el = document.createElement("div");
  el.className = "rscreen";
  view.replaceChildren(el);
  let tab = (ctx.params && ctx.params[0]) === "a4" ? "a4" : "content";
  let data = await api.rules();
  let busy = false;

  const paint = () => {
    const a4 = data.a4 || {};
    const content = data.content || {};
    el.innerHTML = `<header class="ph-bar"><h1>Cấu hình quy tắc</h1>
      <nav class="seg" role="tablist" aria-label="Loại quy tắc">${TABS.map(([k, l]) =>
        `<button type="button" role="tab" data-tab="${k}" aria-selected="${tab === k}">${l}${k === "a4" && a4.total ? ` · ${a4.on}/${a4.total}` : ""}</button>`).join("")}</nav>
      <div class="sp"></div>
      <button class="btn pri" type="button" data-save ${busy ? "disabled" : ""}>Lưu và áp dụng</button>
    </header>
    <div class="page rule-page">
      <p class="muted" style="margin:0">${esc((tab === "a4" ? a4.hint : content.hint) || "")}</p>
      ${tab === "a4" ? a4Html(a4) : contentHtml(content)}
    </div>`;
  };

  const goTab = (next) => {
    tab = next;
    if (location.hash !== `#/rules/${tab}`) history.replaceState(null, "", `#/rules/${tab}`);
    paint();
  };

  paint();
  ctx.setUpdate((params) => {
    const next = params[0] === "a4" ? "a4" : "content";
    if (next !== tab) { tab = next; paint(); }
    return true;
  });

  el.addEventListener("change", (e) => {
    const on = e.target.closest("[data-on]");
    if (on) on.closest(".rule-card")?.classList.toggle("off", !on.checked);
  });
  el.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-tab], [data-save]");
    if (!t) return;
    if (t.dataset.tab) { goTab(t.dataset.tab); return; }
    if (!t.dataset.save || busy) return;
    const a4Body = tab === "a4" ? readA4(el, data.a4) : null;
    const contentBody = tab === "content" ? readContent(el, data.content) : null;
    busy = true;
    t.disabled = true;
    try {
      if (tab === "a4") {
        data.a4 = await api.saveA4Rules(a4Body);
        toast("Đã lưu quy tắc A4 · job tự động lần sau dựng theo bản này");
      } else {
        data.content = await api.saveContentRules(contentBody);
        toast("Đã lưu quy tắc content · AI viết / lịch tự động lần sau dùng bản này");
      }
    } catch (err) {
      toast(err.message, true);
      busy = false;
      const b = el.querySelector("[data-save]");
      if (b) b.disabled = false;
      return;
    }
    busy = false; paint();
  });
}
