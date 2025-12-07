import express from "express";
import bodyParser from "body-parser";
import cors from "cors";

import { chromium } from "playwright";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { chromium as chromiumExtra } from "playwright-extra";

// Enable stealth
chromiumExtra.use(StealthPlugin());

const app = express();
app.use(bodyParser.json({ limit: "10mb" }));
app.use(cors());

// -----------------------------------------
// HEALTH CHECK (Required for Render!)
// -----------------------------------------
app.get("/healthz", (req, res) => {
  res.status(200).send("OK");
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({ status: "ApnaCyber Playwright Worker Running" });
});

// -----------------------------------------
// AUTOMATION ENDPOINT
// -----------------------------------------
app.post("/run", async (req, res) => {
  const { task, data } = req.body;

  console.log("Received task:", task);

  try {
    // launch browser (stealth-enabled)
    const browser = await chromiumExtra.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    let result = {};

    // 1. Open URL
    if (task === "open-url") {
      await page.goto(data.url, { waitUntil: "networkidle" });
      result.title = await page.title();
    }

    // 2. Login task
    else if (task === "login") {
      await page.goto(data.url, { waitUntil: "networkidle" });

      await page.fill(data.usernameSelector, data.username);
      await page.fill(data.passwordSelector, data.password);
      await page.click(data.submitSelector);

      await page.waitForTimeout(3000);
      result.status = "Login completed";
    }

    // Unknown task
    else {
      result.error = "Unknown task";
    }

    await browser.close();
    res.json({ ok: true, result });

  } catch (err) {
    console.error("ERROR:", err);
    res.json({ ok: false, error: err.message });
  }
});

// -----------------------------------------
// START SERVER
// -----------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Worker running on port", PORT));
