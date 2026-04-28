import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Serve the Chat ID Finder page at "/"
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "chatid.html"));
});

// Static files
app.use(express.static(path.join(__dirname, "public")));

// API to fetch chat IDs
app.post("/get-chat-id", async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Bot token is required" });
  }

  try {
    const url = `https://api.telegram.org/bot${token}/getUpdates`;
    const tgRes = await fetch(url);
    const data = await tgRes.json();

    if (!data.ok) {
      return res.status(400).json({ error: "Invalid bot token" });
    }

    const chats = [];
    const seen = new Set();

    for (const update of data.result) {
      if (update.message) {
        const chat = update.message.chat;
        if (!seen.has(chat.id)) {
          seen.add(chat.id);
          chats.push({
            id: chat.id,
            type: chat.type,
            name: chat.title || chat.first_name || "Unknown",
            username: chat.username || "N/A"
          });
        }
      }
    }

    res.json({ success: true, chats });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch chat IDs" });
  }
});

// Export for Vercel
export default app;

// Local dev only
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🚀 Chat ID Finder on port ${PORT}`));
}