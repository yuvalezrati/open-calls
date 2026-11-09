export default function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null });
}
