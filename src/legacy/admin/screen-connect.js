// Cài đặt › Kết nối kênh: Facebook / Instagram / TikTok OAuth + danh sách page.
import { api, appUrl, esc, toast } from "./admin-api.js";

const PF = { facebook: ["FB", "#1877F2"], instagram: ["IG", "#C13584"], tiktok: ["TT", "#E11D48"],
  youtube: ["YT", "#CC0000"], threads: ["@", "#3A3C42"] };
const k = (n) => (n == null ? "—" : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(".", ",")}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(".", ",")}K` : String(Math.round(n)));
const num = (n) => (n == null ? "—" : Number(n).toLocaleString(globalThis.VCB_LOC || "vi-VN"));
const pf = (p, big) => `<span class="pfchip${big ? " big" : ""}" style="background:${(PF[p] || PF.threads)[1]}">${(PF[p] || PF.threads)[0]}</span>`;

export function connectView(lib, d, msg) {
  if (!lib || !d) return '<div class="empty is-busy">Đang tải kết nối kênh…</div>';
  const fb = d.accounts.facebook, ig = d.accounts.instagram, tt = d.accounts.tiktok;
  const igN = lib.pages.filter((p) => p.ig_id).length;
  const nPage = lib.pages.length || fb.page_count || 0;
  const fbUser = fb.user_name || fb.name || "";
  const fbOk = fb.connected && !(fb.missing || []).length && nPage > 0;
  const card = (code, title, status, ok, detail, warn, btn) => `<div class="pcard"><div style="display:flex;gap:10px;align-items:center">${pf(code, true)}
      <span class="chn"><b>${title}</b><span class="small" style="color:${ok ? "var(--ok)" : "var(--muted)"}">${status}</span></span></div>
      <span class="small muted" style="min-height:34px;line-height:1.45">${detail}</span>${warn ? `<span class="warnbox small">${warn}</span>` : ""}${btn}</div>`;
  const link = (href, l, pri) => `<a class="btn${pri ? " pri" : ""}" href="${appUrl(href)}">${l}</a>`;
  const stats = lib.stats || {};
  const mkSel = (id, cur, auto) => `<span class="mkw"><select class="in" data-mk="${esc(id)}" aria-label="Thị trường" style="min-height:30px">${Object.entries(lib.markets).map(([m, l]) => `<option value="${m}" ${cur === m ? "selected" : ""}>${m.toUpperCase()} · ${esc(l)}</option>`).join("")}</select>${auto ? '<span class="small muted auto-h" title="Tự đoán theo tên page — chọn lại để cố định">tự đoán</span>' : ""}</span>`;
  const tmSel = (id, cur) => `<select class="in" data-tm="${esc(id)}" aria-label="Team" style="min-height:30px"><option value="">Chưa gán</option>${lib.teams.map((t) => `<option ${cur === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
  const s = lib.status;
  const rows = lib.pages.map((p) => {
    const a = stats[`facebook:${p.id}`] || {}, b = stats[`instagram:${p.id}`] || {};
    return `<tr class="${p.track ? "" : "off"}" data-row="${esc((p.name + " " + (p.ig_name || "")).toLowerCase())}"><td><input type="checkbox" class="chk" data-track="${esc(p.id)}" ${p.track ? "checked" : ""} aria-label="Cào ${esc(p.name)}"></td>
      <td><span class="chn"><span>${pf("facebook")} <b>${esc(p.name)}</b></span>${p.ig_id ? `<span class="small muted">${pf("instagram")} @${esc(p.ig_name || p.ig_id)}</span>` : ""}</span></td>
      <td>${mkSel(p.id, p.market, p.market_auto)}</td><td>${tmSel(p.id, (lib.channels.find((c) => c.page_id === p.id) || {}).team || "")}</td>
      <td class="num mono">${(a.videos || 0) + (b.videos || 0) || "—"}</td><td class="num mono">${k((a.views30 || 0) + (b.views30 || 0))}</td>
      <td class="small muted">${p.track ? esc((a.last || b.last || "chưa cào").slice(5)) : "Không cào"}</td>
      <td><button class="btn sm" type="button" data-syncone="${esc(p.id)}" ${p.track && !s.running ? "" : "disabled"}>Cào</button></td></tr>`;
  }).join("") + (tt.connected ? (() => { const a = stats["tiktok:tiktok"] || {}; const ch = lib.channels.find((c) => c.platform === "tiktok") || {};
    return `<tr><td><input type="checkbox" class="chk" checked disabled aria-label="Cào TikTok"></td><td><span>${pf("tiktok")} <b>${esc(tt.name)}</b></span></td>
      <td>${mkSel("tiktok", lib.tiktok_market)}</td><td>${tmSel("tiktok", ch.team || "")}</td><td class="num mono">${a.videos || "—"}</td><td class="num mono">${k(a.views30 || 0)}</td>
      <td class="small muted">${esc((a.last || "chưa cào").slice(5))}</td><td><button class="btn sm" type="button" data-syncone="tiktok" ${s.running ? "disabled" : ""}>Cào</button></td></tr>`; })() : "");
  const okMsg = msg && !msg.startsWith("error")
    ? `Đã kết nối tài khoản${fbUser ? " " + fbUser : ""} · ${nPage} Fanpage${igN ? ` · ${igN} Instagram` : ""}.`
    : "";
  return `${msg ? `<div class="box pad" style="border-color:${msg.startsWith("error") ? "var(--bad)" : "var(--ok)"}">${msg.startsWith("error") ? "Kết nối lỗi: " + esc(msg.slice(6)) : esc(okMsg)}</div>` : ""}
    <section class="fb-banner">
      <div class="fb-banner-h">${pf("facebook", true)}<div><b>Kết nối Facebook</b>
        <span>Đăng nhập tài khoản Facebook quản trị — hệ thống lấy toàn bộ Fanpage và Instagram gắn với page (như CQA).</span></div></div>
      <div class="fb-banner-a">
        ${d.apps.meta ? link("/api/social/meta/connect", fb.connected ? "Kết nối lại Facebook" : "Kết nối Facebook", true) : '<span class="chip warn">Thiếu META_APP_ID / SECRET · Cài đặt › Khoá kết nối</span>'}
        ${fb.connected ? '<button class="btn" type="button" data-refreshpages>Cập nhật kênh</button>' : ""}
        ${fb.connected ? '<button class="btn sm danger" type="button" data-disc="meta">Ngắt Facebook</button>' : ""}
      </div>
      ${fb.connected ? `<div class="fb-banner-ok">Đã kết nối${fbUser ? `: <b>${esc(fbUser)}</b>` : ""} · <b>${nPage}</b> Fanpage${igN ? ` · <b>${igN}</b> Instagram` : ""}${fbOk ? "" : " · chưa lấy được page, bấm Kết nối lại"}</div>`
        : '<p class="small" style="margin:0;opacity:.9">Chưa kết nối — bấm nút trên, đăng nhập Facebook, không cần chọn từng page.</p>'}
      ${fb.connected && (fb.missing || []).length ? `<div class="warnbox small">Thiếu quyền: <b class="mono">${fb.missing.map(esc).join(", ")}</b>. Thêm trong app Meta › Quyền, rồi Kết nối lại.</div>` : ""}
    </section>
    <section class="pcards">
      ${card("instagram", "Instagram", igN ? `Theo Fanpage · ${igN} tài khoản` : "Theo Fanpage", !!igN, "Tự lấy khi Fanpage đã gắn Instagram Professional — không cần kết nối riêng", "", fb.connected ? '<span class="small muted">Đi cùng kết nối Facebook</span>' : '<span class="small muted">Kết nối Facebook trước</span>')}
      ${card("tiktok", "TikTok", tt.connected ? "Đã kết nối · 1 kênh" : "Chưa kết nối", tt.connected, tt.connected ? `${esc(tt.name)} · gửi video vào hộp thư, bấm đăng trong app` : "Đăng vào hộp thư TikTok và kéo số liệu",
        "", d.apps.tiktok ? link("/api/social/tiktok/connect", tt.connected ? "Kết nối lại" : "Kết nối", !tt.connected) : '<span class="chip warn">Thiếu khoá app TikTok · Cài đặt › Khoá kết nối</span>')}
    </section>
    <details class="box pad"><summary><b>Nâng cao</b> <span class="small muted">Mã người dùng hệ thống Business Manager — chỉ khi OAuth không thấy hết page</span></summary>
      <div style="display:flex;gap:8px;margin-top:8px"><input class="in mono" id="sys-tok" type="password" placeholder="Mã truy cập người dùng hệ thống" autocomplete="off"><button class="btn" type="button" data-systoken>Dùng mã này</button></div></details>
    <section class="box pad rowbox" style="gap:8px"><b style="margin-right:6px">Team</b>
      ${lib.teams.map((t, i) => `<span class="tchip t${i % 5}">${esc(t)}<span class="mono">${lib.channels.filter((c) => c.team === t && c.platform !== "instagram").length}</span><button type="button" data-rmteam="${esc(t)}" aria-label="Xoá team ${esc(t)}">✕</button></span>`).join("")}
      <input class="in" id="t-new" placeholder="Tên team mới" style="width:170px;min-height:32px" aria-label="Tên team mới"><button class="btn sm gold" type="button" data-addteam>Thêm</button></section>
    <section class="box"><div class="sq-day" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">Page &amp; kênh <span class="small muted" style="font-weight:400">${lib.pages.length + (tt.connected ? 1 : 0)} kênh · ${num(lib.rows.length)} video đã cào${lib.synced_at ? " · lần cuối " + esc(lib.synced_at) : ""}</span><input class="in" id="pg-q" type="search" placeholder="Tìm page" style="width:180px;min-height:32px" aria-label="Tìm page"><div style="flex:1"></div>
      ${s.running ? `<span class="small muted">${esc(s.step)} · ${s.done}/${s.total || "?"}</span><span class="prog"><i style="width:${s.total ? (s.done / s.total) * 100 : 5}%"></i></span>` : ""}
      <select class="in" id="l-days" style="width:auto;min-height:32px" aria-label="Khoảng thời gian cào">${[[30, "30 ngày"], [90, "90 ngày"], [180, "6 tháng"], [365, "1 năm"], [730, "2 năm"]].map(([v, l]) => `<option value="${v}" ${+d.settings.library_days === v ? "selected" : ""}>${l} gần nhất</option>`).join("")}</select>
      <button class="btn pri" type="button" data-syncall ${s.running ? "disabled" : ""}>${s.running ? "Đang cào…" : "Cào tất cả page đã chọn"}</button></div>
      ${s.errors.length ? `<details style="padding:0 16px 10px"><summary class="small" style="color:var(--warn)">${s.errors.length} lỗi lần cào gần nhất</summary><div class="small mono muted">${s.errors.map(esc).join("<br>")}</div></details>` : ""}
      ${rows ? `<div class="tscroll"><table class="ctab"><thead><tr><th>Cào</th><th>Page / kênh</th><th>Thị trường</th><th>Team</th><th class="num">Video</th><th class="num">View 30 ngày</th><th>Cào lần cuối</th><th><span class="sr">Thao tác</span></th></tr></thead><tbody>${rows}</tbody></table></div>`
        : '<div class="empty">Kết nối Facebook ở trên để hiện toàn bộ Fanpage.</div>'}</section>
    <details class="box pad"><summary><b>Hướng dẫn tạo app</b></summary><ol class="small" style="line-height:1.7;margin:8px 0 0;padding-left:18px">
      <li><b>Meta:</b> developers.facebook.com › Facebook Login (không dùng Login for Business / Config ID). Quyền: pages_show_list, pages_read_engagement, read_insights, pages_manage_posts, business_management, instagram_basic, instagram_manage_insights, instagram_content_publish. Redirect URI: <code class="mono">${esc(d.redirects.meta)}</code>. App ID / Secret vào Cài đặt › Khoá kết nối.</li>
      <li><b>TikTok:</b> developers.tiktok.com › Login Kit + Content Posting API, scopes user.info.basic, video.upload, video.publish, video.list. Redirect URI: <code class="mono">${esc(d.redirects.tiktok)}</code>.</li></ol>
      ${tt.connected ? '<div style="margin-top:10px"><button class="btn sm danger" type="button" data-disc="tiktok">Ngắt TikTok</button></div>' : ""}</details>`;
}

const val = (el, sel) => el.querySelector(sel)?.value;

export async function handleConnectClick(t, el, bag) {
  const { paint, reload, watch } = bag;
  if (t.hasAttribute("data-syncall")) { bag.lib.status = await api.socialLibrarySync(+val(el, "#l-days")); paint(); watch(); return true; }
  if (t.dataset.syncone) { bag.lib.status = await api.socialLibrarySync(+val(el, "#l-days"), [t.dataset.syncone]); paint(); watch(); return true; }
  if (t.hasAttribute("data-refreshpages")) { t.disabled = true; t.textContent = "Đang đọc page…"; await api.socialRefreshPages(); await reload(); toast(`Có ${bag.lib.pages.length} page`); return true; }
  if (t.hasAttribute("data-systoken")) { await api.socialSysToken(val(el, "#sys-tok")); await reload(); toast(`Đã dùng mã hệ thống · ${bag.lib.pages.length} page`); return true; }
  if (t.hasAttribute("data-addteam")) { const v = (val(el, "#t-new") || "").trim(); if (!v) return true; await api.socialTeams([...bag.lib.teams, v]); toast("Đã thêm team"); await reload(); return true; }
  if (t.dataset.rmteam) { await api.socialTeams(bag.lib.teams.filter((x) => x !== t.dataset.rmteam)); await reload(); return true; }
  if (t.dataset.disc) { await api.socialDisconnect(t.dataset.disc); toast("Đã ngắt kết nối"); await reload(); return true; }
  return false;
}

export async function handleConnectChange(t, bag) {
  const { lib } = bag;
  if (!lib) return false;
  if (t.dataset.mk) {
    await api.socialPageMarket(t.dataset.mk, { market: t.value });
    t.parentElement.querySelector(".auto-h")?.remove();
    const pg = lib.pages.find((x) => x.id === t.dataset.mk); if (pg) { pg.market = t.value; pg.market_auto = false; }
    lib.channels.filter((c) => c.page_id === t.dataset.mk).forEach((c) => { c.market = t.value; });
    toast(`Đã gán thị trường ${t.value.toUpperCase()}`); return true;
  }
  if (t.dataset.tm !== undefined) {
    await api.socialPageMarket(t.dataset.tm, { team: t.value });
    lib.channels.filter((c) => c.page_id === t.dataset.tm).forEach((c) => { c.team = t.value; });
    toast(t.value ? `Đã gắn ${t.value}` : "Đã bỏ team"); return true;
  }
  if (t.dataset.track) { await api.socialPageMarket(t.dataset.track, { track: t.checked }); t.closest("tr").classList.toggle("off", !t.checked); const pg = lib.pages.find((x) => x.id === t.dataset.track); if (pg) pg.track = t.checked; return true; }
  return false;
}

export function handleConnectInput(e) {
  if (e.target.id !== "pg-q") return false;
  const q = e.target.value.trim().toLowerCase();
  e.target.closest(".sbody, .page")?.querySelectorAll("tr[data-row]").forEach((r) => { r.style.display = !q || r.dataset.row.includes(q) ? "" : "none"; });
  return true;
}
