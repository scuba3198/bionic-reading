const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const distRoot = path.join(projectRoot, 'dist');

const filesToCopy = [
  { src: 'manifest.json', dest: 'manifest.json' },
  { src: 'icon16.png', dest: 'icon16.png' },
  { src: 'icon48.png', dest: 'icon48.png' },
  { src: 'icon128.png', dest: 'icon128.png' },
  { src: 'src/bionic.css', dest: 'src/bionic.css' }
];

// Ensure target directories exist
if (!fs.existsSync(distRoot)) {
  fs.mkdirSync(distRoot, { recursive: true });
}
if (!fs.existsSync(path.join(distRoot, 'src'))) {
  fs.mkdirSync(path.join(distRoot, 'src'), { recursive: true });
}

filesToCopy.forEach(({ src, dest }) => {
  const srcPath = path.join(projectRoot, src);
  const destPath = path.join(distRoot, dest);

  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied ${src} -> dist/${dest}`);
  } else {
    console.warn(`Warning: Source file ${srcPath} does not exist`);
  }
});

console.log('Static asset copying complete.');
