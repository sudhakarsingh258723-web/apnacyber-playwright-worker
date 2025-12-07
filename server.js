import express from "express";
import bodyParser from "body-parser";
import { chromium } from "playwright";

const app = express();
app.use(bodyParser.json({ limit: "10mb" }));

// HEALTH CHECK
app.get("/", (req, res) => {
  res.json({ status: "Playwright Worker Running" });
});

// AUTOMATION ENDPOINT
app.post("/run", async (req, res) => {
  const { task, data } = req.body;

  console.log("Received task:", task);

  try {
    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    let result = {};

    // Example: Open URL
    if (task === "open-url") {
      await page.goto(data.url, { waitUntil: "networkidle" });
      result.title = await page.title();
    }

    // Example: Login
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
      result = { error: "Unknown task" };
    }

    await browser.close();
    res.json({ ok: true, result });
  } catch (err) {
    console.error(err);
    res.json({ ok: false, error: err.message });
  }
});

// ---------------
// START SERVER
// ---------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Worker running on port", PORT));
