import { createHash } from "node:crypto";
import { list, put } from "@vercel/blob";
import { requireUser } from "../lib/auth.js";

// Each person's marks live in one small JSON file in Vercel Blob:
// marks/<hash of Google user id>.json = { name, submitted: {callId: date}, saved: {callId: date} }
const keyFor = (sub) => "marks/" + createHash("sha256").update(sub).digest("hex").slice(0, 32) + ".json";

async function readAll() {
  const out = [];
  let cursor;
  do {
    const page = await list({ prefix: "marks/", cursor, limit: 1000 });
    out.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  const docs = await Promise.all(out.map(async (b) => {
    try {
      const r = await fetch(`${b.url}?v=${new Date(b.uploadedAt).getTime()}`, { cache: "no-store" });
      return { pathname: b.pathname, data: await r.json() };
    } catch { return null; }
  }));
  return docs.filter(Boolean);
}

function shape(all, myKey) {
  const friends = {};
  let mine = { submitted: {}, saved: {} };
  for (const { pathname, data } of all) {
    if (pathname === myKey) mine = { submitted: data.submitted || {}, saved: data.saved || {} };
    for (const id of Object.keys(data.submitted || {})) (friends[id] ||= []).push(data.name || "חבר");
  }
  return { mine, friends };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  let user;
  try { user = await requireUser(req); }
  catch (e) { return res.status(e.status || 401).json({ error: e.message }); }
  const myKey = keyFor(user.sub);

  try {
    if (req.method === "GET") {
      return res.status(200).json(shape(await readAll(), myKey));
    }
    if (req.method === "POST") {
      const { callId, kind, on } = req.body || {};
      if (typeof callId !== "string" || !/^[a-z0-9-]{1,80}$/.test(callId) || !["submitted", "saved"].includes(kind)) {
        return res.status(400).json({ error: "bad request" });
      }
      const all = await readAll();
      const current = all.find((d) => d.pathname === myKey)?.data || {};
      const doc = { name: user.name, submitted: { ...(current.submitted || {}) }, saved: { ...(current.saved || {}) } };
      if (on) doc[kind][callId] = new Date().toISOString().slice(0, 10);
      else delete doc[kind][callId];
      await put(myKey, JSON.stringify(doc), {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
        cacheControlMaxAge: 60,
      });
      const others = all.filter((d) => d.pathname !== myKey);
      return res.status(200).json(shape([...others, { pathname: myKey, data: doc }], myKey));
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "storage error" });
  }
}
