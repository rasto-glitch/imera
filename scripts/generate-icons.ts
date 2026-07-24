// Rasterizes the brand SVGs in assets/brand into the PNG sizes the app
// config needs. Run with: npm run icons
import path from 'node:path';
import sharp from 'sharp';

const BRAND = path.join(__dirname, '..', 'assets', 'brand');

// The SVGs have a 512-unit viewBox; sharp rasterizes at the intrinsic size
// unless told otherwise, so bump the density for targets above 512 to avoid
// rendering small and upscaling.
async function raster(svg: string, size: number, out: string) {
  const density = Math.max(72, Math.ceil((72 * size) / 512));
  await sharp(path.join(BRAND, svg), { density })
    .resize(size, size)
    .png()
    .toFile(path.join(BRAND, out));
  console.log(`${out}  (${size}x${size} from ${svg})`);
}

async function flat(size: number, hex: string, out: string) {
  await sharp({
    create: { width: size, height: size, channels: 4, background: hex },
  })
    .png()
    .toFile(path.join(BRAND, out));
  console.log(`${out}  (${size}x${size} flat ${hex})`);
}

async function main() {
  await raster('icon-light.svg', 1024, 'icon-1024.png'); // iOS App Store, full bleed
  await raster('icon-adaptive-fg.svg', 432, 'adaptive-icon-fg.png');
  await flat(432, '#EDEAE0', 'adaptive-icon-bg.png');
  await raster('icon-light.svg', 512, 'pwa-512.png');
  await raster('icon-light.svg', 192, 'pwa-192.png');
  await raster('icon-small-light.svg', 32, 'favicon-32.png');
  await raster('icon-small-light.svg', 16, 'favicon-16.png');
  await raster('notification-icon.svg', 96, 'notification-icon.png'); // white on transparent
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
