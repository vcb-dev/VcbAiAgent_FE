// Cấu hình quy tắc: content (5A / A4A5 / ngoài VN) và dựng A4.
// Tab content đọc dạng thẻ + danh sách + bảng; sửa từng mục khi cần.
import { api, esc, toast } from "./admin-api.js";

const TABS = [
  ["content", "Quy tắc content"],
  ["a4", "Quy tắc A4"],
];

function tagVal(v) {
  return Array.isArray(v) ? v.join(", ") : String(v ?? "");
}

function inlineFmt(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function isSepRow(cells) {
  return cells.every((c) => /^:?-{3,}:?$/.test(c.replace(/\s/g, "")) || c === "");
}

function cellsOf(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

function prepMd(text) {
  return String(text || "").replace(/\r\n/g, "\n").replace(/[^\n]+/g, (line) => {
    if (/\|-{2,}\|/.test(line) && line.length > 80) {
      return line.replace(/\s*(\|(?:-{2,}\|)+)\s*/g, "\n$1\n");
    }
    return line;
  });
}

function blocksOf(text) {
  const lines = prepMd(text).split("\n");
  const out = [];
  let i = 0;
  const flushP = (buf) => {
    const t = buf.join("\n").trim();
    if (t) out.push({ type: "p", text: t });
  };
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) { i += 1; continue; }
    if (line.startsWith("|") && line.includes("|")) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(cellsOf(lines[i]));
        i += 1;
      }
      const body = rows.filter((r) => !isSepRow(r));
      if (body.length) out.push({ type: "table", rows: body });
      continue;
    }
    if (line.startsWith(">")) {
      const q = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        q.push(lines[i].trim().replace(/^>\s?/, ""));
        i += 1;
      }
      out.push({ type: "quote", text: q.join("\n") });
      continue;
    }
    if (/^#{1,3}\s/.test(line)) {
      out.push({ type: "h", text: line.replace(/^#{1,3}\s+/, "") });
      i += 1;
      continue;
    }
    if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      const ordered = /^\d+\.\s+/.test(line);
      const items = [];
      while (i < lines.length && (/^[-*]\s+/.test(lines[i].trim()) || /^\d+\.\s+/.test(lines[i].trim()))) {
        items.push(lines[i].trim().replace(/^([-*]|\d+\.)\s+/, ""));
        i += 1;
      }
      out.push({ type: ordered ? "ol" : "ul", items });
      continue;
    }
    const buf = [];
    while (i < lines.length) {
      const t = lines[i].trim();
      if (!t) break;
      if (t.startsWith("|") && t.includes("|")) break;
      if (t.startsWith(">")) break;
      if (/^#{1,3}\s/.test(t) || /^[-*]\s+/.test(t) || /^\d+\.\s+/.test(t)) break;
      buf.push(t);
      i += 1;
    }
    flushP(buf);
  }
  return out;
}

function bodyHtml(text) {
  return blocksOf(text).map((b) => {
    if (b.type === "h") return `<h4 class="rule-sh">${inlineFmt(b.text)}</h4>`;
    if (b.type === "quote") {
      return `<blockquote class="rule-q">${b.text.split("\n").map((l) => `<p>${inlineFmt(l)}</p>`).join("")}</blockquote>`;
    }
    if (b.type === "ul" || b.type === "ol") {
      const tag = b.type;
      return `<${tag} class="rule-list">${b.items.map((it) => `<li>${inlineFmt(it)}</li>`).join("")}</${tag}>`;
    }
    if (b.type === "table") {
      const [head, ...rest] = b.rows;
      const th = (head || []).map((c) => `<th>${inlineFmt(c)}</th>`).join("");
      const tb = rest.map((r) => `<tr>${r.map((c) => `<td>${inlineFmt(c)}</td>`).join("")}</tr>`).join("");
      return `<div class="rule-table-wrap"><table class="rule-table"><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></div>`;
    }
    return `<p class="rule-p">${inlineFmt(b.text)}</p>`;
  }).join("");
}

function fieldHtml(rule, f) {
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
          <div class="grow"><b>${esc(r.title)}</b></div>
        </div>
        <p class="rule-note">${esc(r.note)}</p>
        ${r.fields?.length ? `<div class="rule-fields">${r.fields.map((f) => fieldHtml(r, f)).join("")}</div>` : ""}
      </article>`).join("")}
    </section>`).join("");
}

function cleanHeading(h) {
  return String(h || "").replace(/^#{1,3}\s+/, "").replace(/^\d+\.\s+/, "").trim();
}

function isFileMeta(s) {
  const body = String(s.body || "").trim();
  const head = cleanHeading(s.heading);
  if (/^Nguồn\s*:/i.test(body) || /^Nguồn\s*:/i.test(head)) return true;
  if (/^Framework Content 5A/i.test(head) && body.length < 280) return true;
  return false;
}

function hiddenSec(docId, i, s) {
  return `<textarea class="sr" tabindex="-1" aria-hidden="true" data-doc="${esc(docId)}" data-sec="${i}" data-k="body">${esc(s.body || "")}</textarea>
    <input type="hidden" data-doc="${esc(docId)}" data-sec="${i}" data-k="heading" value="${esc(s.heading || "")}">`;
}

function contentHtml(content, docId, editing) {
  const docs = content.docs || [];
  const doc = docs.find((d) => d.id === docId) || docs[0];
  if (!doc) return `<p class="muted">Chưa có quy tắc content.</p>`;
  const rows = (doc.sections || []).map((s, i) => ({ s, i }));
  const shown = rows.filter(({ s }) => !isFileMeta(s));
  return `<div class="rule-docs" role="tablist" aria-label="Nhóm quy tắc content">${docs.map((d) =>
    `<button type="button" class="rule-doc${d.id === doc.id ? " on" : ""}" data-docid="${esc(d.id)}" aria-selected="${d.id === doc.id}">
      <b>${esc(d.title)}</b><span>${esc(d.hint)}</span>
    </button>`).join("")}</div>
    <section class="rule-g" data-doc="${esc(doc.id)}">
      ${rows.filter(({ s }) => isFileMeta(s)).map(({ s, i }) => hiddenSec(doc.id, i, s)).join("")}
      ${shown.map(({ s, i }, n) => {
        const key = `${doc.id}:${i}`;
        const on = editing === key;
        const title = cleanHeading(s.heading) || `Mục ${n + 1}`;
        return `<article class="rule-card rule-read" data-seckey="${esc(key)}">
          <div class="rule-hd">
            <span class="rule-num">${n + 1}</span>
            <div class="grow"><b>${esc(title)}</b></div>
            <button type="button" class="btn sm" data-edit="${esc(key)}">${on ? "Xong" : "Sửa"}</button>
          </div>
          ${on ? `<label class="rule-f"><span class="sr">Tiêu đề mục</span>
              <input class="in" data-doc="${esc(doc.id)}" data-sec="${i}" data-k="heading" value="${esc(s.heading || "")}">
            </label>
            <label class="rule-f"><span class="sr">Nội dung mục</span>
              <textarea class="in rule-md" rows="${Math.min(16, Math.max(8, String(s.body || "").split("\n").length + 1))}"
                data-doc="${esc(doc.id)}" data-sec="${i}" data-k="body">${esc(s.body || "")}</textarea>
            </label>` : `${bodyHtml(s.body)}${hiddenSec(doc.id, i, s)}`}
        </article>`;
      }).join("")}
    </section>`;
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
      heading: el.querySelector(`[data-doc="${CSS.escape(d.id)}"][data-sec="${i}"][data-k="heading"]`)?.value ?? s.heading,
      body: el.querySelector(`[data-doc="${CSS.escape(d.id)}"][data-sec="${i}"][data-k="body"]`)?.value ?? s.body,
    })),
  }));
}

function stashContent(el, content) {
  el.querySelectorAll("[data-doc][data-sec][data-k]").forEach((inp) => {
    const d = (content.docs || []).find((x) => x.id === inp.dataset.doc);
    if (!d) return;
    const i = Number(inp.dataset.sec);
    if (!d.sections[i]) return;
    d.sections[i][inp.dataset.k] = inp.value;
  });
}

export async function render(view, ctx) {
  const el = document.createElement("div");
  el.className = "rscreen";
  view.replaceChildren(el);
  let tab = (ctx.params && ctx.params[0]) === "a4" ? "a4" : "content";
  let data = await api.rules();
  let busy = false;
  let editing = "";
  let docId = (data.content?.docs || [])[0]?.id || "framework";

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
      <p class="rule-lead">${esc((tab === "a4" ? a4.hint : content.hint) || "")}</p>
      ${tab === "a4" ? a4Html(a4) : contentHtml(content, docId, editing)}
    </div>`;
  };

  const goTab = (next) => {
    tab = next;
    editing = "";
    const path = `/rules/${tab}`;
    if (location.pathname !== path) history.replaceState(null, "", path);
    paint();
  };

  paint();
  ctx.setUpdate((params) => {
    const next = params[0] === "a4" ? "a4" : "content";
    if (next !== tab) { tab = next; editing = ""; paint(); }
    return true;
  });

  el.addEventListener("change", (e) => {
    const on = e.target.closest("[data-on]");
    if (on) on.closest(".rule-card")?.classList.toggle("off", !on.checked);
  });
  el.addEventListener("click", async (e) => {
    const docBtn = e.target.closest("[data-docid]");
    if (docBtn) {
      stashContent(el, data.content);
      docId = docBtn.dataset.docid;
      editing = "";
      paint();
      return;
    }
    const ed = e.target.closest("[data-edit]");
    if (ed) {
      stashContent(el, data.content);
      editing = editing === ed.dataset.edit ? "" : ed.dataset.edit;
      paint();
      const ta = el.querySelector("textarea.rule-md");
      if (ta) ta.focus();
      return;
    }
    const t = e.target.closest("[data-tab], [data-save]");
    if (!t) return;
    if (t.dataset.tab) { stashContent(el, data.content); goTab(t.dataset.tab); return; }
    if (!t.dataset.save || busy) return;
    stashContent(el, data.content);
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
    busy = false;
    editing = "";
    paint();
  });
}
