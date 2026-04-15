import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, '..');
const buildResourcesRoot = resolve(projectRoot, 'build-resources');
const requirementsPath = resolve(projectRoot, 'requirements.txt');
const backendEntryPath = resolve(projectRoot, 'backend', 'downloader.py');
const PYINSTALLER_VERSION = process.env.DEXUX_PYINSTALLER_VERSION ?? '6.16.0';

const PLATFORM_CONFIG = {
  linux: {
    label: 'Linux',
    outputDirectory: resolve(buildResourcesRoot, 'backend', 'linux'),
    artifactName: 'downloader',
  },
  win32: {
    label: 'Windows',
    outputDirectory: resolve(buildResourcesRoot, 'backend', 'win32'),
    artifactName: 'downloader.exe',
  },
};

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    ...options,
  });

  if (result.status === 0) {
    return;
  }

  if (result.error) {
    throw result.error;
  }

  throw new Error(`Command failed: ${command} ${args.join(' ')}`);
}

function isCommandAvailable(command, args = []) {
  try {
    const result = spawnSync(command, [...args, '--version'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: 'ignore',
      windowsHide: true,
    });

    return result.status === 0;
  } catch {
    return false;
  }
}

function resolveHostPythonCommand() {
  const candidates = [];

  if (process.env.PYTHON_PATH) {
    candidates.push({ command: process.env.PYTHON_PATH, args: [] });
  }

  const localVenvs = ['venv', '.venv'];

  for (const venvName of localVenvs) {
    const candidatePath = resolve(
      projectRoot,
      venvName,
      process.platform === 'win32' ? 'Scripts' : 'bin',
      process.platform === 'win32' ? 'python.exe' : 'python',
    );

    if (existsSync(candidatePath)) {
      candidates.push({ command: candidatePath, args: [] });
    }
  }

  if (process.platform === 'win32') {
    candidates.push(
      { command: 'py', args: ['-3'] },
      { command: 'python', args: [] },
      { command: 'python3', args: [] },
    );
  } else {
    candidates.push({ command: 'python3', args: [] }, { command: 'python', args: [] });
  }

  for (const candidate of candidates) {
    if (isCommandAvailable(candidate.command, candidate.args)) {
      return candidate;
    }
  }

  throw new Error('Python 3 is required to build the standalone backend.');
}

function resolveBuildEnvironmentPaths() {
  const root = resolve(buildResourcesRoot, 'backend-build', process.platform);
  const pythonPath = resolve(
    root,
    'venv',
    process.platform === 'win32' ? 'Scripts' : 'bin',
    process.platform === 'win32' ? 'python.exe' : 'python',
  );

  return {
    root,
    pythonPath,
  };
}

function ensureBuildEnvironment() {
  const buildEnvironment = resolveBuildEnvironmentPaths();

  if (!existsSync(buildEnvironment.pythonPath)) {
    mkdirSync(buildEnvironment.root, { recursive: true });
    const hostPython = resolveHostPythonCommand();
    runCommand(hostPython.command, [...hostPython.args, '-m', 'venv', resolve(buildEnvironment.root, 'venv')], {
      windowsHide: true,
    });
  }

  runCommand(buildEnvironment.pythonPath, ['-m', 'pip', 'install', '--upgrade', 'pip'], {
    windowsHide: true,
  });
  runCommand(
    buildEnvironment.pythonPath,
    ['-m', 'pip', 'install', '-r', requirementsPath, `pyinstaller==${PYINSTALLER_VERSION}`],
    { windowsHide: true },
  );

  return buildEnvironment.pythonPath;
}

function buildBackendExecutable(pythonPath, platformConfig) {
  const pyInstallerRoot = resolve(buildResourcesRoot, 'pyinstaller', process.platform);
  const workPath = resolve(pyInstallerRoot, 'work');
  const specPath = resolve(pyInstallerRoot, 'spec');

  rmSync(platformConfig.outputDirectory, { recursive: true, force: true });
  rmSync(pyInstallerRoot, { recursive: true, force: true });
  mkdirSync(platformConfig.outputDirectory, { recursive: true });
  mkdirSync(workPath, { recursive: true });
  mkdirSync(specPath, { recursive: true });

  runCommand(
    pythonPath,
    [
      '-m',
      'PyInstaller',
      '--noconfirm',
      '--clean',
      '--onefile',
      '--name',
      'downloader',
      '--distpath',
      platformConfig.outputDirectory,
      '--workpath',
      workPath,
      '--specpath',
      specPath,
      '--collect-all',
      'yt_dlp',
      backendEntryPath,
    ],
    { windowsHide: true },
  );

  const artifactPath = resolve(platformConfig.outputDirectory, platformConfig.artifactName);

  if (!existsSync(artifactPath)) {
    throw new Error(`Standalone backend was not created at ${artifactPath}`);
  }
}

function main() {
  const targetPlatform = process.argv[2] ?? process.platform;
  const platformConfig = PLATFORM_CONFIG[targetPlatform];

  if (!platformConfig) {
    throw new Error('Standalone backend packaging is only configured for Linux and Windows.');
  }

  if (targetPlatform !== process.platform) {
    throw new Error(`Build the ${platformConfig.label} package on ${platformConfig.label} so PyInstaller can create a native backend.`);
  }

  const pythonPath = ensureBuildEnvironment();
  buildBackendExecutable(pythonPath, platformConfig);
  console.log(`Standalone backend ready: ${resolve(platformConfig.outputDirectory, platformConfig.artifactName)}`);
}

main();
