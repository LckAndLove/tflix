/* Generates build/icon.ico from the existing PNG icon set in ../../assets/icons.
   electron-builder uses this for the Windows executable + installer, and the
   Electron main process uses it for the window icon (in dev). */

const fs = require('fs');
const path = require('path');
const pngToIco = require('png-to-ico');

const ASSETS = path.join(__dirname, '..', '..', '..', 'assets', 'icons');
const OUT_DIR = path.join(__dirname, '..', 'build');
const OUT_ICO = path.join(OUT_DIR, 'icon.ico');
const OUT_PNG = path.join(OUT_DIR, 'icon.png');

// .ico supports sizes up to 256px — exclude icon_1024.png.
// electron-builder requires at least one 256x256 image in the .ico.
const SIZES = ['16', '32', '48', '64', '128', '256'];

(async () => {
  try {
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const png1024 = path.join(ASSETS, 'icon_1024.png');
    if (fs.existsSync(png1024)) {
      fs.copyFileSync(png1024, OUT_PNG);
      console.log('[make-icon] Copied', OUT_PNG);
    }

    const sources = SIZES
      .map((s) => path.join(ASSETS, `icon_${s}.png`))
      .filter((f) => fs.existsSync(f));

    if (!sources.length) {
      console.warn('[make-icon] No source PNGs found in', ASSETS, '— skipping.');
      return;
    }

    const buf = await pngToIco(sources);
    fs.writeFileSync(OUT_ICO, buf);
    console.log('[make-icon] Wrote', OUT_ICO, `(${sources.length} sizes)`);
  } catch (err) {
    console.error('[make-icon] Failed:', err.message);
    process.exitCode = 1;
  }
})();
