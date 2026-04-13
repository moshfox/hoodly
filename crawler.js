import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";

const MAX_PAGES = 120;

const visited = new Set();
const queue = [];
const index = [];

function readLinesFile(filename) {
  const filePath = path.join(process.cwd(), filename);

  if (!fs.existsSync(filePath)) return [];

  return fs
    .readFileSync(filePath, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"));
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

function cleanText(str = "") {
  return str
    .replace(/\s+/g, " ")
    .replace(/\u00A0/g, " ")
    .trim();
}

function extractBestText($) {
  $("script, style, noscript, svg, canvas, iframe").remove();
  $("nav, footer, header, aside").remove();
  $("#sidebar, #overlay, .menu, .topbar, .quick, .footerHint, .chatWidget").remove();

  const candidates = [
    "main",
    "article",
    "[role='main']",
    ".content",
    ".main",
    ".page",
    "section"
  ];

  for (const selector of candidates) {
    const el = $(selector).first();
    if (el.length) {
      const txt = cleanText(el.text());
      if (txt.length > 120) return txt;
    }
  }

  return cleanText($("body").text());
}

async function crawlPage(url) {
  try {
    const { data } = await axios.get(url, {
      timeout: 10000,
      headers: {
        "User-Agent": "HoodlyBot/1.0"
      }
    });

    const $ = cheerio.load(data);

    const title = cleanText($("title").first().text()) || "Untitled";

    const metaDescription =
      cleanText($('meta[name="description"]').attr("content") || "") ||
      cleanText($('meta[property="og:description"]').attr("content") || "");

    const text = extractBestText($).slice(0, 2500);
    const description = metaDescription || text.slice(0, 220);

    index.push({
      url,
      title,
      description,
      text
    });

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;

      try {
        const absolute = new URL(href, url).toString();
        const clean = normalizeUrl(absolute);
        if (!clean) return;
        if (visited.has(clean)) return;
        if (queue.includes(clean)) return;

        queue.push(clean);
      } catch {}
    });

    console.log("Indexed:", url);
  } catch (err) {
    console.log("Failed:", url, err.message);
  }
}

async function runCrawler() {
  const seeds = readLinesFile("seeds.txt");
  const manualLinks = readLinesFile("manual-links.txt");

  const initialUrls = [...new Set([...seeds, ...manualLinks])]
    .map(normalizeUrl)
    .filter(Boolean);

  queue.push(...initialUrls);

  while (queue.length && visited.size < MAX_PAGES) {
    const url = queue.shift();
    if (!url || visited.has(url)) continue;

    visited.add(url);
    await crawlPage(url);
  }

  const outDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(outDir, "index.json"),
    JSON.stringify(index, null, 2),
    "utf-8"
  );

  console.log(`Done. Indexed ${index.length} pages.`);
}

runCrawler();