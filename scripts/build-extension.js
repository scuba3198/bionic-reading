const { build } = require('vite');
const path = require('path');
const fs = require('fs');

const distPath = path.join(__dirname, '../dist');

async function buildAll() {
  // 1. Clean dist folder
  if (fs.existsSync(distPath)) {
    fs.rmSync(distPath, { recursive: true, force: true });
  }

  // 2. Build Popup
  console.log('Building Popup...');
  await build({
    configFile: false,
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      rollupOptions: {
        input: {
          popup: path.resolve(__dirname, '../src/popup.html'),
        },
        output: {
          entryFileNames: 'src/[name].js',
          assetFileNames: (assetInfo) => {
            if (assetInfo.name === 'popup.css' || assetInfo.name === 'style.css') {
              return 'src/style.css';
            }
            return 'assets/[name]-[hash][extname]';
          }
        }
      }
    }
  });

  // 3. Build Background Script (IIFE format for MV3 background worker compatibility)
  console.log('Building Background...');
  await build({
    configFile: false,
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      lib: {
        entry: path.resolve(__dirname, '../src/bg.ts'),
        name: 'bg',
        formats: ['iife'],
        fileName: () => 'src/bg.js',
      },
      sourcemap: false,
      minify: 'esbuild',
    }
  });

  // 4. Build Content Script (IIFE format for injection safety)
  console.log('Building Content Script...');
  await build({
    configFile: false,
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      lib: {
        entry: path.resolve(__dirname, '../src/convert.ts'),
        name: 'convert',
        formats: ['iife'],
        fileName: () => 'src/convert.js',
      },
      sourcemap: false,
      minify: 'esbuild',
    }
  });

  console.log('All builds completed successfully!');
}

buildAll().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
