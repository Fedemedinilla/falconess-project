import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
const [out, dataPath] = process.argv.slice(2);
const data = JSON.parse(readFileSync(dataPath, "utf8"));
const srv = createServer((q, r) => { let p = join("dist", decodeURIComponent(q.url.split("?")[0])); if (!existsSync(p) || p.endsWith("/")) p = join("dist", "index.html"); const t = {".js":"text/javascript",".css":"text/css",".html":"text/html",".png":"image/png",".webp":"image/webp",".svg":"image/svg+xml",".jpg":"image/jpeg"}[extname(p)] ?? "application/octet-stream"; r.writeHead(200, {"content-type": t}); r.end(readFileSync(p)); }).listen(4992);
const scenes = ["peregrina-chief-warning","peregrina-debut-win","peregrina-debut","peregrina-first-vos","peregrina-invitation","peregrina-nap","peregrina-press","peregrina-prologue","peregrina-rookie","peregrina-summit","peregrina-tears","peregrina-tiresome","peregrina-warmup"];
const b = await chromium.launch();
async function open(w, h, dpr) {
  const page = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  await page.goto("http://localhost:4992/#juego");
  await page.evaluate(([save, seed, sc]) => {
    localStorage.setItem("falconess.pruebas.partida", JSON.stringify(save));
    localStorage.setItem("falconess.juego.historia", JSON.stringify({ runs: { [seed]: sc }, ever: sc }));
  }, [data.save, data.save.seed, scenes]);
  await page.reload();
  await page.click("#m-titulo"); await page.click("#m-continuar");
  for (let i = 0; i < 30; i++) { if (await page.locator("#m-efectos").count()) { await page.click("#m-efectos"); continue; } if (await page.locator("#m-entrenar").count()) break; await page.waitForTimeout(200); }
  await page.waitForTimeout(1200);
  return page;
}
const d = await open(1440, 900, 1.5);
for (const t of ["menu", "log", "goals", "crews", "guide"]) {
  await d.click(`#m-panel-${t}`); await d.waitForTimeout(300);
  await d.screenshot({ path: `${out}/d-${t}.png` });
}
await d.click("#m-panel-goals"); await d.click('#m-metas [data-turn="20"]'); await d.waitForTimeout(500);
await d.screenshot({ path: `${out}/d-track.png` });
await d.keyboard.press("Escape");
await d.click("#m-panel-menu");
await d.click("#m-entrenar"); await d.waitForTimeout(400); await d.click("#m-entrenar-agility"); await d.waitForTimeout(700);
await d.screenshot({ path: `${out}/d-train.png` });
await d.click("#m-entrenar-agility"); await d.waitForTimeout(1300);
await d.screenshot({ path: `${out}/d-result.png` });
const big = await open(1920, 1080, 1);
await big.screenshot({ path: `${out}/d-1920.png` });
const ph = await open(390, 844, 2);
await ph.screenshot({ path: `${out}/p-menu.png` });
await ph.click("#m-menu"); await ph.waitForTimeout(400);
await ph.screenshot({ path: `${out}/p-sheet.png` });
await ph.click("#m-panel-abrir-crews"); await ph.waitForTimeout(400);
await ph.screenshot({ path: `${out}/p-crews.png` });
await b.close(); srv.close();
