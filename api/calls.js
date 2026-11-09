import { readFileSync } from "node:fs";
import { join } from "node:path";
import { requireUser } from "../lib/auth.js";

// The list is only for signed-in people: verify the Google token, then hand over data/calls.json.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  try { await requireUser(req); }
  catch (e) { return res.status(e.status || 401).json({ error: e.message }); }
  try {
    const raw = readFileSync(join(process.cwd(), "data", "calls.json"), "utf8");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).send(raw);
  } catch {
    return res.status(500).json({ error: "could not read calls" });
  }
}
