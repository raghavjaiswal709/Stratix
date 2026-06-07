const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, '../public/favicon.svg');
const dests = [
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 }
];

async function generate() {
  if (!fs.existsSync(svgPath)) {
    console.error(`Error: Source SVG not found at ${svgPath}`);
    process.exit(1);
  }

  const svgBuffer = fs.readFileSync(svgPath);

  for (const dest of dests) {
    const destPath = path.join(__dirname, '../public', dest.name);
    
    // sharp can render SVG into PNG at high resolution
    await sharp(svgBuffer)
      .resize(dest.size, dest.size)
      .png()
      .toFile(destPath);
      
    console.log(`Generated ${dest.name} at ${dest.size}x${dest.size}px`);
  }
  
  console.log('All icons generated successfully!');
}

generate().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
