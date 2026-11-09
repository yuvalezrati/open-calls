const TYPE_HE = { exhibition: "תערוכה", residency: "רזידנסי", grant: "מענק", prize: "פרס", festival: "פסטיבל", publication: "פרסום", other: "אחר" };
const REGION_HE = { il: "בארץ", abroad: "חו״ל", online: "אונליין" };
const TOKEN_KEY = "oc-google-token";
const TOPICS = { photo: "צילום", video: "וידאו וקולנוע", sound: "סאונד", painting: "ציור ורישום", sculpture: "פיסול ומיצב", newmedia: "מדיה חדשה ודיגיטל", performance: "פרפורמנס", public: "אמנות במרחב הציבורי", social: "אמנות חברתית ואקטיביזם", text: "טקסט ופרסומים" };

const state = { tab: "open", region: "all", q: "", deadline: "all", type: "all", sort: "deadline", free: false, hideDone: false, saved: false, match: true };
let calls = [], updatedAt = null, loaded = false;
let token = null, profile = null;
const EMPTY = () => ({ submitted: {}, saved: {}, interests: [], onboarded: false });
let mine = EMPTY();
let marksLoaded = false, pickerOpen = false, picked = new Set();
let friends = {}; // callId -> [names who submitted]

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : "#"; } catch { return "#"; } };
const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
const days = (iso) => Math.round((new Date(iso + "T00:00:00") - today()) / 864e5);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmt = (iso) => { const [y, m, d] = iso.split("-"); return `${+d}.${+m}.${y.slice(2)}`; };

try { const s = JSON.parse(localStorage.getItem("oc-filters") || "null"); if (s) Object.assign(state, s, { q: "" }); } catch {}
const persist = () => { try { const { q, ...rest } = state; localStorage.setItem("oc-filters", JSON.stringify(rest)); } catch {} };

/* ---------- auth ---------- */
function decodeJwt(t) {
  try { return JSON.parse(decodeURIComponent(escape(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))))); } catch { return null; }
}
function setToken(t) {
  const p = t && decodeJwt(t);
  if (!p || p.exp * 1000 < Date.now() + 60e3) { token = null; profile = null; try { localStorage.removeItem(TOKEN_KEY); } catch {} return false; }
  token = t; profile = { name: p.given_name || p.name || p.email, picture: p.picture, email: p.email };
  try { localStorage.setItem(TOKEN_KEY, t); } catch {}
  return true;
}
function lock() {
  setToken(null); mine = EMPTY(); friends = {}; marksLoaded = false; pickerOpen = false;
  calls = []; loaded = false; updatedAt = null;
  $("list").innerHTML = ""; $("count").textContent = "";
  renderMe(); render();
}
function signOut() {
  lock();
  try { google.accounts.id.disableAutoSelect(); } catch {}
}
// token ran out mid-visit (Google tokens last an hour): lock, then try a silent re-login
function expire() {
  lock();
  try { google.accounts.id.prompt(); } catch {}
}
async function authed(path, init = {}) {
  const r = await fetch(path, { ...init, headers: { Authorization: "Bearer " + token, ...(init.headers || {}) } });
  if (r.status === 401) { expire(); throw new Error("expired"); }
  if (r.status === 403) throw new Error("forbidden");
  if (!r.ok) throw new Error("failed");
  return r.json();
}
async function api(method, body) {
  return authed("/api/marks", { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
}
async function loadCalls() {
  if (!token) return;
  try {
    const d = await authed("/api/calls");
    calls = d.calls || []; updatedAt = d.updatedAt; loaded = true; showScan(); render();
  } catch (e) {
    if (e.message === "forbidden") { lock(); gateNotice("החשבון הזה עוד לא ברשימת החברים של הלוח. בקש מיובל להוסיף אותך."); return; }
    if (e.message !== "expired") $("list").innerHTML = `<div class="empty"><strong>לא הצלחתי לטעון את הרשימה</strong><span>רענן את העמוד בעוד רגע.</span></div>`;
  }
}
function gateNotice(msg) { $("gateNotice").innerHTML = msg ? `<div class="notice">${esc(msg)}</div>` : ""; }
async function loadMarks() {
  if (!token) return;
  try {
    const d = await api("GET");
    mine = { ...EMPTY(), ...(d.mine || {}) }; friends = d.friends || {}; marksLoaded = true;
    if (!mine.onboarded) openPicker();
    render();
  } catch (e) {
    if (e.message === "forbidden") notice("החשבון הזה לא ברשימת החברים של הלוח.");
  }
}
function renderMe() {
  const signedIn = !!token;
  $("gate").hidden = signedIn; $("app").hidden = !signedIn; $("scan").hidden = !signedIn;
  if (signedIn) gateNotice("");
  $("me").innerHTML = signedIn
    ? `${profile.picture ? `<img src="${esc(profile.picture)}" alt="" referrerpolicy="no-referrer">` : ""}<span>${esc(profile.name)}</span><button class="linkbtn" id="signout">התנתק</button>`
    : "";
  if (signedIn) $("signout").onclick = signOut;
}
async function initAuth() {
  let cfg;
  try { cfg = await (await fetch("/api/config")).json(); } catch {}
  if (!cfg || !cfg.googleClientId) { gateNotice("ההתחברות לא מוגדרת כרגע. נסה שוב מאוחר יותר."); return; }
  const waitGsi = () => new Promise((res) => { const t = setInterval(() => { if (window.google?.accounts?.id) { clearInterval(t); res(); } }, 100); });
  await waitGsi();
  google.accounts.id.initialize({
    client_id: cfg.googleClientId,
    callback: (resp) => { if (setToken(resp.credential)) { renderMe(); loadCalls(); loadMarks(); } },
    auto_select: true,
    use_fedcm_for_prompt: true,
  });
  google.accounts.id.renderButton($("gbtn"), { theme: "filled_black", size: "large", text: "signin_with", locale: "he", shape: "rectangular", width: 264 });
  $("gbtnWrap").classList.remove("loading");
  if (!token) google.accounts.id.prompt(); // returning friends get signed in silently
}

/* ---------- list ---------- */
function pill(c) {
  if (!c.deadline) return `<span class="pill p-roll">שוטף</span>`;
  const d = days(c.deadline);
  const cls = d <= 7 ? "p-soon" : d <= 30 ? "p-mid" : "p-far";
  return `<span class="pill ${cls}">${d === 0 ? "היום" : d === 1 ? "מחר" : "עוד " + d + " ימים"}</span>`;
}
const hasInterests = () => !!(token && mine.interests && mine.interests.length);
// a call "fits" when it shares a topic with you; calls open to every medium ("any") fit everyone
const fits = (c) => (c.topics || ["any"]).some((t) => t === "any" || mine.interests.includes(t));
const strongFit = (c) => (c.topics || []).some((t) => mine.interests.includes(t));
const openCalls = () => calls.filter((c) => c.status !== "recurring" && (!c.deadline || days(c.deadline) >= 0));
function filtered() {
  let list = state.tab === "open" ? openCalls() : calls.filter((c) => c.status === "recurring");
  const q = state.q.trim().toLowerCase();
  list = list.filter((c) => {
    if (state.region !== "all" && c.region !== state.region) return false;
    if (state.type !== "all" && c.type !== state.type) return false;
    if (state.free && c.fee !== "free") return false;
    if (token && state.hideDone && mine.submitted[c.id]) return false;
    if (token && state.saved && !mine.saved[c.id]) return false;
    if (hasInterests() && state.match && !fits(c)) return false;
    if (state.tab === "open" && state.deadline !== "all") {
      if (state.deadline === "none") { if (c.deadline) return false; }
      else if (!c.deadline) return false;
      else { const d = days(c.deadline); if (state.deadline === "later" ? d <= 90 : d > +state.deadline) return false; }
    }
    if (q) { const hay = [c.title, c.org, c.place, c.desc, (c.tags || []).join(" ")].join(" ").toLowerCase(); if (!hay.includes(q)) return false; }
    return true;
  });
  const dl = (c) => c.deadline || "9999-12-31";
  list.sort((a, b) => {
    const dd = !!mine.submitted[a.id] - !!mine.submitted[b.id]; if (dd) return dd;
    if (hasInterests()) { const fd = strongFit(b) - strongFit(a); if (fd) return fd; }
    if (state.sort === "added") return String(b.addedAt || "").localeCompare(String(a.addedAt || ""));
    return dl(a).localeCompare(dl(b));
  });
  return list;
}
function renderPicker() {
  $("topics").hidden = !(token && pickerOpen);
  $("lMatch").hidden = !hasInterests();
  $("editTopics").hidden = !marksLoaded;
  $("editTopics").textContent = hasInterests() ? "התחומים שלי (" + mine.interests.length + ")" : "בחר תחומים";
  if (!pickerOpen) return;
  $("topicChips").innerHTML = Object.entries(TOPICS).map(([k, v]) => `<button data-t="${k}" aria-pressed="${picked.has(k)}">${esc(v)}</button>`).join("");
  $("topicsSave").disabled = !picked.size && !hasInterests();
  $("topicsSkip").textContent = hasInterests() ? "סגור" : "דלג, תראה לי הכול";
}
function openPicker() { picked = new Set(mine.interests || []); pickerOpen = true; renderPicker(); }
async function saveInterests(list) {
  pickerOpen = false;
  const prev = mine;
  mine = { ...mine, interests: list, onboarded: true };
  if (list.length) state.match = true;
  syncControls(); render();
  try { const d = await api("POST", { interests: list }); if (d?.mine) mine = { ...EMPTY(), ...d.mine }; render(); }
  catch (e) { if (e.message !== "expired") { mine = prev; render(); notice("הבחירה לא נשמרה. נסה שוב בעוד רגע."); } }
}
$("topicChips").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-t]"); if (!b) return;
  const t = b.dataset.t; picked.has(t) ? picked.delete(t) : picked.add(t); renderPicker();
});
$("topicsSave").addEventListener("click", () => saveInterests([...picked]));
$("topicsSkip").addEventListener("click", () => {
  if (hasInterests()) { pickerOpen = false; renderPicker(); return; }
  saveInterests([]); // skipping is remembered, so the question doesn't come back
});
$("editTopics").addEventListener("click", () => { pickerOpen ? (pickerOpen = false, renderPicker()) : openPicker(); });

function render() {
  renderPicker();
  $("nOpen").textContent = loaded ? openCalls().length : "";
  $("nRec").textContent = loaded ? calls.filter((c) => c.status === "recurring").length : "";
  $("fDeadline").disabled = state.tab !== "open";
  if (!loaded || !token) return;
  const list = filtered();
  $("count").textContent = list.length ? `${list.length} תוצאות` : "";
  if (!list.length) {
    $("list").innerHTML = `<div class="empty"><strong>אין תוצאות לסינון הזה</strong><span>${hasInterests() && state.match ? "נסה לבטל את ״רק מה שמתאים לתחומים שלי״ או להרחיב את טווח הדדליין." : "נסה להרחיב את טווח הדדליין או לנקות את הסינון."}</span></div>`;
    return;
  }
  const weekAgo = ymd(new Date(today() - 7 * 864e5));
  const myName = profile?.name;
  $("list").innerHTML = `<div class="strip">${list.map((c, i) => {
    const done = !!mine.submitted[c.id], saved = !!mine.saved[c.id];
    const others = (friends[c.id] || []).filter((n) => !(done && n === myName));
    const hits = hasInterests() ? (c.topics || []).filter((t) => mine.interests.includes(t)) : [];
    const tags = hits.map((t) => `<span class="tag match">${esc(TOPICS[t])}</span>`).join("") + [TYPE_HE[c.type] || "", (REGION_HE[c.region] || "") + (c.place ? " · " + c.place : "")]
      .filter(Boolean).map((t) => `<span class="tag">${esc(t)}</span>`).join("")
      + (c.fee === "free" ? `<span class="tag free">בלי דמי הגשה</span>` : c.fee === "paid" ? `<span class="tag">${esc(c.feeNote || "בתשלום")}</span>` : "")
      + (c.addedAt && c.addedAt >= weekAgo && c.status !== "recurring" ? `<span class="tag new">חדש</span>` : "")
      + (c.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("");
    const when = c.status === "recurring"
      ? `<span class="date">${esc(c.lastDeadline || "—")}</span><span class="pill p-roll">נסגר לאחרונה</span>`
      : `<span class="date">${c.deadline ? fmt(c.deadline) : "ללא תאריך"}</span>${done ? `<span class="pill p-far">✓ הוגש</span>` : pill(c)}`;
    const acts = token ? `<div class="acts">
        <button class="star" data-kind="saved" data-id="${esc(c.id)}" aria-pressed="${saved}">${saved ? "★ שמור" : "☆ שמור"}</button>
        ${c.status !== "recurring" ? `<button data-kind="submitted" data-id="${esc(c.id)}" aria-pressed="${done}">${done ? "✓ הגשתי" : "הגשתי"}</button>` : ""}
      </div>` : "";
    return `<article class="frame${done ? " is-done" : ""}">
      <div class="fno">${String(i + 1).padStart(2, "0")}A</div>
      <div class="body">
        <h3 class="title"><a href="${esc(safeUrl(c.url))}" target="_blank" rel="noopener">${esc(c.title)}</a></h3>
        <span class="org">${esc(c.org)}</span>
        ${c.desc ? `<p class="desc">${esc(c.desc)}</p>` : ""}
        <div class="tags">${tags}</div>
        ${others.length ? `<span class="friends">הגישו: ${others.map(esc).join(", ")}</span>` : ""}
      </div>
      <div class="when">${when}${c.verified === false ? `<span class="pill p-check">לוודא</span>` : ""}${acts}</div>
    </article>`;
  }).join("")}</div>`;
}
function notice(msg) { $("notice").innerHTML = msg ? `<div class="notice">${esc(msg)}</div>` : ""; }

/* ---------- controls ---------- */
function syncControls() {
  document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === state.tab));
  document.querySelectorAll(".chips button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.r === state.region));
  $("fDeadline").value = state.deadline; $("fType").value = state.type; $("fSort").value = state.sort;
  $("fFree").checked = state.free; $("fHideDone").checked = state.hideDone; $("fSaved").checked = state.saved; $("fMatch").checked = state.match;
}
function set(k, v) { state[k] = v; persist(); syncControls(); render(); }
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => set("tab", b.dataset.tab)));
document.querySelectorAll(".chips button").forEach((b) => b.addEventListener("click", () => set("region", b.dataset.r)));
$("q").addEventListener("input", (e) => { state.q = e.target.value; render(); });
$("fDeadline").addEventListener("change", (e) => set("deadline", e.target.value));
$("fType").addEventListener("change", (e) => set("type", e.target.value));
$("fSort").addEventListener("change", (e) => set("sort", e.target.value));
$("fFree").addEventListener("change", (e) => set("free", e.target.checked));
$("fHideDone").addEventListener("change", (e) => set("hideDone", e.target.checked));
$("fSaved").addEventListener("change", (e) => set("saved", e.target.checked));
$("fMatch").addEventListener("change", (e) => set("match", e.target.checked));
$("reset").addEventListener("click", () => {
  Object.assign(state, { region: "all", q: "", deadline: "all", type: "all", sort: "deadline", free: false, hideDone: false, saved: false, match: false });
  $("q").value = ""; persist(); syncControls(); render();
});

let queue = Promise.resolve();
$("list").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-kind]"); if (!b || !token) return;
  const kind = b.dataset.kind, id = b.dataset.id, on = !mine[kind][id];
  const prev = mine;
  mine = { ...mine, submitted: { ...mine.submitted }, saved: { ...mine.saved } };
  if (on) mine[kind][id] = ymd(new Date()); else delete mine[kind][id];
  render();
  queue = queue.then(() => api("POST", { callId: id, kind, on }))
    .then((d) => { if (d?.mine) { mine = { ...EMPTY(), ...d.mine }; } notice(""); })
    .catch((err) => { if (err.message !== "expired") { mine = prev; render(); notice("הסימון לא נשמר. נסה שוב בעוד רגע."); } });
});

/* ---------- boot ---------- */
function showScan() {
  if (!updatedAt) { $("scanText").textContent = "עוד לא רצה סריקה"; return; }
  const t = new Date(updatedAt), hrs = (Date.now() - t) / 36e5;
  $("scanDot").classList.toggle("stale", hrs > 36);
  $("scanText").textContent = `עודכן ${t.toLocaleDateString("he-IL", { day: "numeric", month: "numeric" })} ${t.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`;
}
syncControls();
{ let stored = null; try { stored = localStorage.getItem(TOKEN_KEY); } catch {} setToken(stored); }
renderMe();
if (token) { loadCalls(); loadMarks(); }
initAuth();
