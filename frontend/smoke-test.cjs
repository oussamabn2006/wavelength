const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on("console", msg => {
    if (msg.type() === "error") console.log("CONSOLE ERROR:", msg.text());
  });

  page.on("pageerror", error => console.log("PAGE ERROR:", error.message));

  const response = await page.goto("http://localhost:8080", {
    waitUntil: "domcontentloaded"
  });

  await page.waitForTimeout(3000);

  console.log("HTTP STATUS:", response.status());
  console.log("PAGE TITLE:", await page.title());
  console.log("PAGE URL:", page.url());

  await page.screenshot({
    path: "wavelength-smoke-test.png",
    fullPage: true
  });

  await browser.close();
})();
