/**
 * ApnaCyber Playwright Worker v7.0
 * --------------------------------
 * Core automation engine for:
 * 1) Google Portal Discovery
 * 2) LGD Expansion
 * 3) Metadata Extraction
 * 4) Precheck (auto / hybrid / partner)
 * 5) Full Playwright Pipeline Execution
 */

import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import fetch from "node-fetch";
import { chromium } from "playwright";
import { v4 as uuidv4 } from "uuid";

// ==== ENV ====
const WORKER_SECRET = process.env.PLAYWRIGHT_WORKER_SECRET || "";
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || "";
const GOOGLE_CX = process.env.GOOGLE_CX || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

// ==== SERVER ====
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "30mb" }));

// ==== AUTH MIDDLEWARE ====
app.use((req, res, next) => {
  if (!WORKER_SECRET) return next(); // dev mode
  const key = req.headers["x-worker-key"];
  if (key !== WORKER_SECRET)
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  next();
});

// Root
app.get("/", (req, res) => {
  res.json({ ok: true, worker: "ApnaCyber Playwright Worker v7.0" });
});


// ===================================================
// 1️⃣ GOOGLE SEARCH → FIND PORTAL URLS
// ===================================================
app.post("/search-portal", async (req, res) => {
  try {
    const { query, limit = 5 } = req.body;
    if (!query) return res.status(400).json({ ok: false, error: "Missing query" });

    if (!GOOGLE_API_KEY || !GOOGLE_CX) {
      return res.json({ ok: true, results: [] });
    }

    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX}&q=${encodeURIComponent(
      query
    )}&num=${limit}`;

    const resp = await fetch(url);
    const data = await resp.json();

    const results =
      (data.items || []).map((d) => ({
        title: d.title,
        link: d.link,
        snippet: d.snippet,
        displayLink: d.displayLink,
      })) || [];

    return res.json({ ok: true, results });
  } catch (e) {
    return res.json({ ok: false, error: e.message });
  }
});


// ===================================================
// 2️⃣ LGD VARIANT EXPANSION (AI)
// ===================================================
app.post("/lgd-expand", async (req, res) => {
  try {
    const { service_name, variant_type } = req.body;

    if (!OPENAI_API_KEY) {
      return res.json({
        ok: true,
        expansions: [
          { name: service_name, variant: variant_type, desc: "Base flow" },
        ],
      });
    }

    const prompt = `
You are ApnaCyber LGD Expansion Engine.
Service: ${service_name}
Variant: ${variant_type}

Return JSON array of:
[
 { "name": "", "desc": "", "keywords": [] }
]
Only JSON. No explanation.
    `;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const j = await r.json();
    const text = j?.choices?.[0]?.message?.content || "[]";

    let arr = [];
    try {
      arr = JSON.parse(text);
    } catch {
      arr = [{ name: service_name, desc: text }];
    }

    return res.json({ ok: true, expansions: arr });
  } catch (err) {
    return res.json({ ok: false, error: err.message });
  }
});


// ===================================================
// 3️⃣ PRECHECK (automatable / hybrid / partner)
// ===================================================
app.post("/precheck", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.json({ ok: false, error: "Missing url" });

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35000 });

    const text = await page.evaluate(() => document.body.innerText);
    const lower = text.toLowerCase();

    let autoScore = 0;
    if (lower.includes("apply online")) autoScore++;
    if (lower.includes("captcha")) autoScore -= 1;
    if (lower.includes("otp")) autoScore -= 1;
    if (lower.includes("upload")) autoScore++;
    if (lower.includes("payment")) autoScore++;

    let category = "hybrid";
    if (autoScore >= 2) category = "automatable";
    if (autoScore <= -1) category = "partner_required";

    // extract PDF links
    const pdfLinks = await page.$$eval("a", (as) =>
      as
        .filter((a) => a.href.toLowerCase().endsWith(".pdf"))
        .map((a) => a.href)
    );

    // extract apply urls
    const applyUrls = await page.$$eval("a", (as) =>
      as
        .filter((a) =>
          /apply|registration|login|submit|proceed|online/i.test(
            a.innerText + " " + a.href
          )
        )
        .map((a) => a.href)
    );

    return res.json({
      ok: true,
      precheck: {
        url,
        category,
        autoScore,
        pdfLinks: pdfLinks.slice(0, 10),
        applyUrls: applyUrls.slice(0, 10),
      },
    });
  } catch (err) {
    return res.json({ ok: false, error: err.message });
  } finally {
    await browser.close();
  }
});


// ===================================================
// 4️⃣ PLAYWRIGHT PIPELINE EXECUTOR
// ===================================================
app.post("/run-pipeline", async (req, res) => {
  const { pipeline } = req.body;
  if (!pipeline || !Array.isArray(pipeline))
    return res.json({ ok: false, error: "Invalid pipeline" });

  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const runId = uuidv4();

  const out = [];

  try {
    for (let step of pipeline) {
      const { action, payload } = step;

      try {
        if (action === "open-url") {
          await page.goto(payload.url, { waitUntil: "networkidle" });
          out.push({ action, ok: true });
        }

        if (action === "click") {
          await page.click(payload.selector);
          out.push({ action, ok: true });
        }

        if (action === "fill") {
          await page.fill(payload.selector, payload.value);
          out.push({ action, ok: true });
        }

        if (action === "screenshot") {
          const img = await page.screenshot({ fullPage: true });
          out.push({ action, ok: true, screenshot: img.toString("base64") });
        }
      } catch (e) {
        out.push({ action, ok: false, error: e.message });
        break;
      }
    }

    return res.json({ ok: true, runId, steps: out });
  } catch (err) {
    return res.json({ ok: false, error: err.message });
  } finally {
    await browser.close();
  }
});


// ===================================================
// START SERVER
// ===================================================
app.listen(process.env.PORT || 10000, () => {
  console.log("ApnaCyber Playwright Worker v7 running");
});
