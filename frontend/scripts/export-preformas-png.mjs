import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const skipGeneral = process.argv.includes('--skip-general');
const allFiles = [
  { name: 'merma-preformas-op-caja.svg', width: 1280, height: 760 },
  { name: 'cajas-preformas-op-caja.svg', width: 1280, height: 760 },
  { name: 'consumo-preformas-observadas.svg', width: 1920, height: 1080 },
  { name: 'avance-consumo-preformas.svg', width: 1600, height: 900 },
  { name: 'resumen-indicadores-calidad.svg', width: 1920, height: 1080 }
];
const files = skipGeneral
  ? allFiles.filter((file) => file.name !== 'resumen-indicadores-calidad.svg')
  : allFiles;

const browser = await chromium.launch({
  executablePath: chromePath
});

for (const file of files) {
  const page = await browser.newPage({
    viewport: { width: file.width, height: file.height },
    deviceScaleFactor: 2
  });
  const svgPath = path.resolve('dist', file.name);
  const pngPath = path.resolve('dist', file.name.replace(/\.svg$/i, '.png'));
  const svg = fs.readFileSync(svgPath, 'utf8');
  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          html, body { margin: 0; width: ${file.width}px; height: ${file.height}px; background: #fff; }
          svg { display: block; width: ${file.width}px; height: ${file.height}px; }
        </style>
      </head>
      <body>
        ${svg}
      </body>
    </html>
  `);
  await page.screenshot({ path: pngPath, fullPage: false });
  await page.close();
  console.log(pngPath);
}

await browser.close();
