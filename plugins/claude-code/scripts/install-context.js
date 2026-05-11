#!/usr/bin/env node
/**
 * install-context.js
 * Downloads OAC context files to .claude/context/ in the current project.
 *
 * Requirements: node, git (nothing else to install)
 *
 * Run from project root:
 *   node install-context.js [--profile=standard] [--force] [--dry-run]
 */

const { execSync } = require('child_process');
const { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, mkdtempSync } = require('fs');
const { join } = require('path');
const os = require('os');

// Configuration
const GITHUB_REPO = 'kalihat007/OpenAgentsControl';
const GITHUB_BRANCH = 'main';
const CONTEXT_SOURCE_PATH = '.opencode/context';

// Roots resolved after parsing --global flag in main()
const PROJECT_ROOT = process.cwd();
const GLOBAL_ROOT = join(os.homedir(), '.claude');

// Installation profiles
const PROFILES = {
  core: {
    categories: ['core', 'openagents-repo'],
  },
  full: {
    categories: [
      'core',
      'openagents-repo',
      'development',
      'ui',
      'content-creation',
      'data',
      'product',
      'learning',
      'project',
      'project-intelligence',
    ],
  },
};

// Map user-facing profile names → internal profile names
const PROFILE_MAP = {
  'essential':   'core',
  'standard':    'core',
  'extended':    'full',
  'specialized': 'full',
  'all':         'full',
  'core':        'core',
  'full':        'full',
};

// Colors
const c = {
  reset:  '\x1b[0m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
};
const log = {
  info:    (msg) => console.log(`${c.blue}ℹ${c.reset} ${msg}`),
  success: (msg) => console.log(`${c.green}✓${c.reset} ${msg}`),
  warning: (msg) => console.log(`${c.yellow}⚠${c.reset} ${msg}`),
  error:   (msg) => console.error(`${c.red}✗${c.reset} ${msg}`),
};

function checkDependencies() {
  try {
    execSync('command -v git', { stdio: 'ignore' });
  } catch {
    log.error('git is required but not found.');
    log.info('Install: brew install git (Mac) or sudo apt install git (Linux)');
    process.exit(1);
  }
}

/**
 * Download context via git sparse-checkout.
 * Returns the commit SHA of the downloaded content.
 */
function downloadContext(categories, contextDir) {
  const tempDir = mkdtempSync(join(os.tmpdir(), 'oac-context-'));

  try {
    log.info(`Downloading from ${GITHUB_REPO}...`);

    log.info('Cloning repository...');
    execSync(
      `git clone --depth 1 --filter=blob:none --sparse https://github.com/${GITHUB_REPO}.git "${tempDir}"`,
      { stdio: 'pipe' }
    );

    const commitSha = execSync(`git -C "${tempDir}" rev-parse HEAD`, { encoding: 'utf-8' }).trim();

    log.info('Configuring sparse checkout...');
    const sparsePaths = [
      ...categories.map(cat => `${CONTEXT_SOURCE_PATH}/${cat}`),
      `${CONTEXT_SOURCE_PATH}/navigation.md`,
    ];
    execSync(
      `git -C "${tempDir}" sparse-checkout set --skip-checks ${sparsePaths.join(' ')}`,
      { stdio: 'pipe' }
    );

    log.info('Copying context files...');
    mkdirSync(contextDir, { recursive: true });
    const sourceDir = join(tempDir, CONTEXT_SOURCE_PATH);

    if (!existsSync(sourceDir)) {
      throw new Error('Context directory not found in repository');
    }
    execSync(`cp -r "${sourceDir}/"* "${contextDir}/"`, { stdio: 'pipe' });

    const fileCount = execSync(`find "${contextDir}" -type f | wc -l`, { encoding: 'utf-8' }).trim();
    log.success(`Downloaded ${fileCount.trim()} files`);

    return commitSha;

  } catch (error) {
    log.error('Failed to download context');
    if (error instanceof Error) log.error(error.message);
    process.exit(1);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function createManifest(profile, categories, commitSha, contextDir, manifestFile) {
  const files = {};
  for (const category of categories) {
    const categoryPath = join(contextDir, category);
    if (existsSync(categoryPath)) {
      files[category] = parseInt(
        execSync(`find "${categoryPath}" -type f | wc -l`, { encoding: 'utf-8' }).trim(),
        10
      );
    }
  }

  const manifest = {
    version: '1.0.0',
    profile,
    source: {
      repository: GITHUB_REPO,
      branch: GITHUB_BRANCH,
      commit: commitSha,
      downloaded_at: new Date().toISOString(),
    },
    categories,
    files,
  };

  mkdirSync(join(manifestFile, '..'), { recursive: true });
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
  log.success(`Manifest created: ${manifestFile}`);
}

function showUsage() {
  console.log(`
Usage: node install-context.js [OPTIONS]

Downloads OAC context files. Requirements: node, git (nothing else to install)
Works on Mac, Linux, and Windows.

OPTIONS:
  --profile=NAME    Profile: essential, standard, extended, all (default: standard)
  --global          Install to ~/.claude/context/ (all projects share it)
  --force           Re-download even if already installed
  --dry-run         Show what would be installed without downloading
  --help            Show this help

PROFILES:
  essential/standard  Core context (core + openagents-repo)
  extended/all        Full context (all categories)

SCOPE:
  default (no flag)   Installs to .claude/context/ in the current project
  --global            Installs to ~/.claude/context/ for all projects
`);
}

function main() {
  const args = process.argv.slice(2);
  let profileName = 'standard';
  let customCategories = [];
  let isGlobal = false;
  let force = false;
  let dryRun = false;

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      showUsage();
      process.exit(0);
    } else if (arg === '--force') {
      force = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--global') {
      isGlobal = true;
    } else if (arg.startsWith('--profile=')) {
      profileName = arg.split('=')[1];
      if (!PROFILE_MAP[profileName]) {
        log.error(`Unknown profile: ${profileName}`);
        log.info(`Valid profiles: ${Object.keys(PROFILE_MAP).join(', ')}`);
        process.exit(1);
      }
    } else if (arg.startsWith('--category=')) {
      customCategories.push(arg.split('=')[1]);
    } else if (PROFILE_MAP[arg]) {
      profileName = arg;
    } else {
      log.error(`Unknown argument: ${arg}`);
      showUsage();
      process.exit(1);
    }
  }

  // Resolve install targets based on scope
  const installRoot = isGlobal ? GLOBAL_ROOT : join(PROJECT_ROOT, '.claude');
  const CONTEXT_DIR = join(installRoot, 'context');
  const MANIFEST_FILE = join(installRoot, '.context-manifest.json');
  const scopeLabel = isGlobal ? 'global (~/.claude/context)' : 'project (.claude/context)';

  const categories = customCategories.length > 0
    ? (profileName = 'custom', customCategories)
    : PROFILES[PROFILE_MAP[profileName] || 'core'].categories;

  // Already installed?
  if (existsSync(MANIFEST_FILE) && !force) {
    log.warning(`Context already installed at ${scopeLabel}. Use --force to reinstall.`);
    try {
      const manifest = JSON.parse(readFileSync(MANIFEST_FILE, 'utf-8'));
      log.info(`Profile: ${manifest.profile}, installed: ${manifest.source?.downloaded_at?.slice(0, 10)}`);
    } catch { /* ignore */ }
    process.exit(0);
  }

  checkDependencies();

  console.log('');
  log.info(`Scope:      ${scopeLabel}`);
  log.info(`Profile:    ${profileName}`);
  log.info(`Categories: ${categories.join(', ')}`);
  log.info(`Target:     ${CONTEXT_DIR}`);
  console.log('');

  if (dryRun) {
    log.info('Dry run — no files downloaded');
    return;
  }

  const commitSha = downloadContext(categories, CONTEXT_DIR);
  createManifest(profileName, categories, commitSha, CONTEXT_DIR, MANIFEST_FILE);

  if (isGlobal) {
    log.info('Global install — no .oac.json needed (discovery chain finds ~/.claude/context automatically)');
  } else {
    const oacJson = join(PROJECT_ROOT, '.oac.json');
    if (!existsSync(oacJson)) {
      writeFileSync(oacJson, JSON.stringify({ version: '1', context: { root: '.claude/context' } }, null, 2));
      log.success('.oac.json created at project root');
    } else {
      log.info('.oac.json already exists — skipping');
    }
  }

  console.log('');
  log.success('Context installation complete!');
  log.info(`Scope:    ${scopeLabel}`);
  log.info(`Context:  ${CONTEXT_DIR}`);
  log.info(`Manifest: ${MANIFEST_FILE}`);
  console.log('');
}

main();
