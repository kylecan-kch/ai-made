import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function buildOfflineHtml() {
  console.log('1. Running Vite build for CSS extraction...');
  execSync('npx vite build', { cwd: rootDir, stdio: 'inherit' });

  // Find generated CSS file in dist/assets
  const assetsDir = path.join(rootDir, 'dist', 'assets');
  const files = fs.readdirSync(assetsDir);
  const cssFile = files.find(f => f.endsWith('.css'));
  if (!cssFile) {
    throw new Error('No CSS file found in dist/assets!');
  }
  const cssContent = fs.readFileSync(path.join(assetsDir, cssFile), 'utf8');
  console.log(`2. Found CSS: ${cssFile} (${(cssContent.length / 1024).toFixed(1)} KB)`);

  // Build React app using esbuild to IIFE (pure non-module, zero file:// CORS issues)
  console.log('3. Bundling application to classic IIFE script with esbuild...');
  const buildResult = await esbuild.build({
    entryPoints: [path.join(rootDir, 'src', 'main.tsx')],
    bundle: true,
    format: 'iife',
    minify: true,
    write: false,
    define: {
      'process.env.NODE_ENV': '"production"',
      'global': 'window',
    },
    loader: {
      '.png': 'dataurl',
      '.svg': 'dataurl',
      '.css': 'empty',
    },
  });

  let jsCode = buildResult.outputFiles[0].text;
  console.log(`4. Generated raw IIFE JS: ${(jsCode.length / 1024).toFixed(1)} KB`);

  // Safely escape all HTML parser triggers inside the JavaScript code
  // In JS strings or regexes, \x3C is standard hex escape for '<'
  // This prevents any browser HTML parser from accidentally matching </script>, <body>, etc.
  const safeJs = jsCode
    .replace(/<\/script/gi, '\\x3C/script')
    .replace(/<script/gi, '\\x3Cscript')
    .replace(/<!--/gi, '\\x3C!--')
    .replace(/<\/title/gi, '\\x3C/title')
    .replace(/<title/gi, '\\x3Ctitle')
    .replace(/<\/head/gi, '\\x3C/head')
    .replace(/<head/gi, '\\x3Chead')
    .replace(/<\/body/gi, '\\x3C/body')
    .replace(/<body/gi, '\\x3Cbody')
    .replace(/<\/style/gi, '\\x3C/style')
    .replace(/<style/gi, '\\x3Cstyle');

  console.log('5. HTML parser safety escaping applied.');

  // Construct complete standalone HTML
  const standaloneHtml = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>阚哥不求人转换器 - 通讯录提取转换 (离线独立版)</title>
    <meta name="description" content="免费好用，无需额外付费" />
    <style>
/* Reset & Tailwind styles */
${cssContent}
    </style>
  </head>
  <body class="bg-slate-100/70 text-slate-900 font-sans antialiased">
    <div id="root"></div>
    <script>
/* 阚哥不求人转换器 - Self-Contained Standalone IIFE Application */
${safeJs}
    </script>
  </body>
</html>`;

  // Ensure public and dist directories exist
  const publicDir = path.join(rootDir, 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const standalonePublicPath = path.join(publicDir, 'standalone.html');
  fs.writeFileSync(standalonePublicPath, standaloneHtml, 'utf8');

  const standaloneDistPath = path.join(rootDir, 'dist', '阚哥不求人转换器_离线版.html');
  fs.writeFileSync(standaloneDistPath, standaloneHtml, 'utf8');

  console.log(`✅ Standalone single-file HTML built successfully!`);
  console.log(`   - File: ${standalonePublicPath} (${(standaloneHtml.length / 1024).toFixed(1)} KB)`);
  console.log(`   - File: ${standaloneDistPath} (${(standaloneHtml.length / 1024).toFixed(1)} KB)`);
}

buildOfflineHtml().catch(err => {
  console.error('Build offline html failed:', err);
  process.exit(1);
});
