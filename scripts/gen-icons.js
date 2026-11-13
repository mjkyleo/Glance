#!/usr/bin/env node
/*
 * 由矢量标记生成 Glance 的全部图标 / 启动图资源。
 * 依赖（仅生成时需要，不入 package.json）：npm install --no-save sharp png2icons
 * 用法：node scripts/gen-icons.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const png2icons = require('png2icons');

const ROOT = path.resolve(__dirname, '..');
const INK = '#222C34';
const LIGHT = '#E6F0F8';
const TILE_BG = '#0F171D';

const STROKE = 28;
const PATH = {
  ring: 'M 640.6 259.8 A 200 200 0 1 0 653.4 554.4',
  bar: 'M 512 413 L 712 413',
  stem: 'M 712 413 L 712 566 Q 712 634 644 662 Q 586 686 512 680',
  left: 'M 512 688 Q 484 712 454 746 Q 428 776 404 798',
  right: 'M 512 688 Q 540 712 570 746 Q 596 776 620 798',
};
const NODES = [
  { cx: 512, cy: 680, r: 26 },
  { cx: 404, cy: 798, r: 22 },
  { cx: 620, cy: 798, r: 22 },
];

const strokes = [PATH.ring, PATH.bar, PATH.stem, PATH.left, PATH.right];

function markGroup(color, scale = 1) {
  const t = scale === 1 ? '' : ` transform="translate(${512 * (1 - scale)} ${512 * (1 - scale)}) scale(${scale})"`;
  const paths = strokes.map((d) => `<path d="${d}"/>`).join('');
  const nodes = NODES.map((n) => `<circle cx="${n.cx}" cy="${n.cy}" r="${n.r}"/>`).join('');
  return `<g${t} fill="none" stroke="${color}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">${paths}<g fill="${color}" stroke="none">${nodes}</g></g>`;
}

function svg(size, { color = INK, scale = 1, bg = null, round = false } = {}) {
  let bgEl = '';
  if (bg && round) bgEl = `<circle cx="512" cy="512" r="512" fill="${bg}"/>`;
  else if (bg) bgEl = `<rect width="1024" height="1024" rx="180" fill="${bg}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="${size}" height="${size}">${bgEl}${markGroup(color, scale)}</svg>`;
}

async function render(target, size, opts) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  await sharp(Buffer.from(svg(size, opts))).png().toFile(target);
  console.log(`${path.relative(ROOT, target)}  ${size}x${size}`);
}

async function pngBuffer(size, opts) {
  return sharp(Buffer.from(svg(size, opts))).png().toBuffer();
}

const android = (rel) => path.join(ROOT, 'android/app/src/main/res', rel);
const MIPMAPS = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const FOREGROUNDS = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
const SPLASH = {
  'drawable/splash.png': [480, 320],
  'drawable-port-mdpi/splash.png': [320, 480],
  'drawable-port-hdpi/splash.png': [480, 800],
  'drawable-port-xhdpi/splash.png': [720, 1280],
  'drawable-port-xxhdpi/splash.png': [960, 1600],
  'drawable-port-xxxhdpi/splash.png': [1280, 1920],
  'drawable-land-mdpi/splash.png': [480, 320],
  'drawable-land-hdpi/splash.png': [800, 480],
  'drawable-land-xhdpi/splash.png': [1280, 720],
  'drawable-land-xxhdpi/splash.png': [1600, 960],
  'drawable-land-xxxhdpi/splash.png': [1920, 1280],
};

async function main() {
  // 矢量源文件（透明底，供文档 / 后续修改使用）
  fs.mkdirSync(path.join(ROOT, 'assets/logo'), { recursive: true });
  for (const [name, color] of [['glance-logo.svg', INK], ['glance-logo-light.svg', LIGHT]]) {
    const out = path.join(ROOT, 'assets/logo', name);
    fs.writeFileSync(out, svg(1024, { color, scale: 1 }).replace(' width="1024" height="1024"', ''));
    console.log(path.relative(ROOT, out));
  }
  fs.writeFileSync(
    path.join(ROOT, 'assets/logo/glance-icon.svg'),
    svg(1024, { color: LIGHT, bg: TILE_BG, scale: 1.15 })
  );

  // Electron / Windows / macOS
  const iconPng = path.join(ROOT, 'assets/icons/app-icon.png');
  await render(iconPng, 1024, { color: LIGHT, bg: TILE_BG, scale: 1.15 });
  for (const size of [16, 32, 64, 128, 256, 512, 1024]) {
    await render(path.join(ROOT, `assets/icons/app.iconset/icon_${size}x${size}.png`), size, {
      color: LIGHT, bg: TILE_BG, scale: 1.15,
    });
  }
  const big = await pngBuffer(1024, { color: LIGHT, bg: TILE_BG, scale: 1.15 });
  fs.writeFileSync(path.join(ROOT, 'assets/icons/app-icon.ico'), png2icons.createICO(big, png2icons.BICUBIC, 0, true, false));
  fs.writeFileSync(path.join(ROOT, 'assets/icons/app-icon.icns'), png2icons.createICNS(big, png2icons.BICUBIC, 0));
  console.log('assets/icons/app-icon.ico / app-icon.icns');

  // Android 传统图标 + Adaptive 前景
  for (const [density, size] of Object.entries(MIPMAPS)) {
    await render(android(`mipmap-${density}/ic_launcher.png`), size, { color: LIGHT, bg: TILE_BG, scale: 1.15 });
    await render(android(`mipmap-${density}/ic_launcher_round.png`), size, { color: LIGHT, bg: TILE_BG, round: true, scale: 1.1 });
  }
  for (const [density, size] of Object.entries(FOREGROUNDS)) {
    await render(android(`mipmap-${density}/ic_launcher_foreground.png`), size, { color: LIGHT, scale: 0.9 });
  }

  // Android 启动图
  for (const [rel, [w, h]] of Object.entries(SPLASH)) {
    const logoH = Math.round(h * 0.22);
    const logoW = Math.round(logoH * (1024 / 1024));
    const logo = await sharp(Buffer.from(svg(logoH, { color: LIGHT, scale: 1 })))
      .resize(logoH, logoH)
      .png()
      .toBuffer();
    const out = android(rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await sharp({ create: { width: w, height: h, channels: 4, background: TILE_BG } })
      .composite([{ input: logo, left: Math.round((w - logoW) / 2), top: Math.round((h - logoH) / 2) }])
      .png()
      .toFile(out);
    console.log(`${rel}  ${w}x${h}`);
  }

  // Adaptive Icon 矢量前景（Android 8+）
  const vectorPaths = strokes
    .map((d) => `        <path\n            android:fillColor="#00000000"\n            android:strokeColor="${LIGHT}"\n            android:strokeWidth="${STROKE}"\n            android:strokeLineCap="round"\n            android:strokeLineJoin="round"\n            android:pathData="${d}" />`)
    .join('\n');
  const vectorNodes = NODES.map((n) => {
    const d = `M ${n.cx - n.r} ${n.cy} a ${n.r} ${n.r} 0 1 1 ${n.r * 2} 0 a ${n.r} ${n.r} 0 1 1 ${-n.r * 2} 0`;
    return `        <path\n            android:fillColor="${LIGHT}"\n            android:strokeColor="#00000000"\n            android:pathData="${d}" />`;
  }).join('\n');
  const foregroundXml = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="1024"
    android:viewportHeight="1024">
    <!-- Glance 标记：G 形词根 + 主干 + 左右分叉，缩放后落在 66dp 安全区内 -->
    <group
        android:scaleX="0.9"
        android:scaleY="0.9"
        android:translateX="51.2"
        android:translateY="51.2">
${vectorPaths}
${vectorNodes}
    </group>
</vector>
`;
  for (const rel of ['drawable/ic_launcher_foreground.xml', 'drawable-v24/ic_launcher_foreground.xml']) {
    fs.writeFileSync(android(rel), foregroundXml);
    console.log(rel);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
