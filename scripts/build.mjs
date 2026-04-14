import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, '..');
const distRoot = resolve(projectRoot, 'dist');
const rendererDistDir = resolve(distRoot, 'renderer');
const tscCliPath = resolve(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc');

function cleanDistDirectory() {
  rmSync(distRoot, { recursive: true, force: true });
  mkdirSync(rendererDistDir, { recursive: true });
}

function compileTypeScript() {
  execFileSync(process.execPath, [tscCliPath], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
}

function copyRendererAssets() {
  const assetFiles = ['index.html', 'styles.css'];

  for (const fileName of assetFiles) {
    copyFileSync(resolve(projectRoot, 'renderer', fileName), resolve(rendererDistDir, fileName));
  }
}

cleanDistDirectory();
compileTypeScript();
copyRendererAssets();
