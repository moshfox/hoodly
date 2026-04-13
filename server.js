import express from "express";
import fs from "fs";
import path from "path";
import cors from "cors";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const INDEX_PATH = path.join(process.cwd(), "data", "index.json");

function loadIndex() {
  try {
    if (!fs.existsSync(INDEX_PATH)) return [];
    const raw = fs.readFileSync(INDEX_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function cleanText(str = "") {
  return str.replace(/\s+/g, " ").trim();
}

function scoreResult(page, queryWords) {
  let score = 0;

  const title = (page.title || "").toLowerCase();
  const text = (page.text || "").toLowerCase();
  const url = (page.url || "").toLowerCase();
  const description = (page.description || "").toLowerCase();

  for (const word of queryWords) {
    if (title.includes(word)) score += 10;
    if (description.includes(word)) score += 6;
    if (url.includes(word)) score += 3;
    if (text.includes(word)) score += 2;
  }

  return score;
}

function makeSnippet(page, queryWords) {
  const source = cleanText(page.description || page.text || "");
  if (!source) return "";

  const lower = source.toLowerCase();

  for (const word of queryWords) {
    const i = lower.indexOf(word);
    if (i !== -1) {
      const start = Math.max(0, i - 70);
      const end = Math.min(source.length, i + 150);
      return source.slice(start, end).trim();
    }
  }

  return source.slice(0, 220).trim();
}

app.get("/search", (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();

  if (!q) {
    return res.json({ results: [] });
  }

  const queryWords = q.split(/\s+/).filter(Boolean);
  const pages = loadIndex();

  const results = pages
    .map(page => ({
      ...page,
      _score: scoreResult(page, queryWords)
    }))
    .filter(page => page._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 20)
    .map(({ _score, ...page }) => ({
      url: page.url,
      title: page.title,
      description: makeSnippet(page, queryWords)
    }));

  res.json({ results });
});

app.listen(PORT, () => {
  console.log(`Search server running on http://localhost:${PORT}`);
});