import { readFileSync } from "node:fs";
import { join } from "node:path";

// The list is public; signing in only adds personal marks and topic matching.
export default function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
  try {
    const raw = readFileSync(join(process.cwd(), "data", "calls.json"), "utf8");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).send(raw);
  } catch {
    return res.status(500).json({ error: "could not read calls" });
  }
}
