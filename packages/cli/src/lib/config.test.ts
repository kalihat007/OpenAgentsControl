import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readConfig,
  writeConfig,
  createDefaultConfig,
  mergeConfig,
  isYoloMode,
  isAutoBackup,
  isExpertMode,
  isAgentSwarmEnabled,
  getMaxParallelAgents,
  getMaxApiCallsPerSession,
  getConfigPath,
} from './config.js';

// ── getConfigPath ─────────────────────────────────────────────────────────────
// Pure function — no I/O.

describe('getConfigPath', () => {
  // ✅ Positive: returns the expected path
  test('returns .oac/config.json under the project root', () => {
    // Arrange
    const projectRoot = '/home/user/my-project';
    // Act
    const result = getConfigPath(projectRoot);
    // Assert
    expect(result).toBe('/home/user/my-project/.oac/config.json');
  });

  // ✅ Positive: works with trailing slash stripped by path.join
  test('handles project roots without trailing slash', () => {
    const result = getConfigPath('/tmp/proj');
    expect(result).toEndWith('/.oac/config.json');
  });
});

// ── createDefaultConfig ───────────────────────────────────────────────────────
// Pure function — no I/O.

describe('createDefaultConfig', () => {
  // ✅ Positive: returns version "1"
  test('returns a config with version "1"', () => {
    const config = createDefaultConfig();
    expect(config.version).toBe('1');
  });

  // ✅ Positive: yoloMode defaults to false
  test('yoloMode defaults to false', () => {
    const config = createDefaultConfig();
    expect(config.preferences.yoloMode).toBe(false);
  });

  // ✅ Positive: autoBackup defaults to true
  test('autoBackup defaults to true', () => {
    const config = createDefaultConfig();
    expect(config.preferences.autoBackup).toBe(true);
  });

  // ✅ Positive: expertMode defaults to true
  test('expertMode defaults to true', () => {
    const config = createDefaultConfig();
    expect(config.preferences.expertMode).toBe(true);
  });

  // ✅ Positive: useAgentSwarm defaults to true
  test('useAgentSwarm defaults to true', () => {
    const config = createDefaultConfig();
    expect(config.preferences.useAgentSwarm).toBe(true);
  });

  // ✅ Positive: maxParallelAgents defaults to 2
  test('maxParallelAgents defaults to 2', () => {
    const config = createDefaultConfig();
    expect(config.preferences.maxParallelAgents).toBe(2);
  });

  // ✅ Positive: maxApiCallsPerSession defaults to 500
  test('maxApiCallsPerSession defaults to 500', () => {
    const config = createDefaultConfig();
    expect(config.preferences.maxApiCallsPerSession).toBe(500);
  });

  // ❌ Negative: two calls return independent objects (no shared reference)
  test('returns a new object on each call', () => {
    const a = createDefaultConfig();
    const b = createDefaultConfig();
    // Mutating one should not affect the other
    a.preferences.yoloMode = true;
    expect(b.preferences.yoloMode).toBe(false);
  });
});

// ── mergeConfig ───────────────────────────────────────────────────────────────
// Pure function — no I/O.

describe('mergeConfig', () => {
  // ✅ Positive: overrides a single preference field
  test('overrides yoloMode when provided', () => {
    // Arrange
    const base = createDefaultConfig();
    // Act
    const merged = mergeConfig(base, { yoloMode: true });
    // Assert
    expect(merged.preferences.yoloMode).toBe(true);
  });

  // ✅ Positive: preserves unspecified preference fields
  test('preserves autoBackup when only yoloMode is overridden', () => {
    const base = createDefaultConfig(); // autoBackup: true
    const merged = mergeConfig(base, { yoloMode: true });
    expect(merged.preferences.autoBackup).toBe(true);
  });

  // ✅ Positive: overrides autoBackup
  test('overrides autoBackup when provided', () => {
    const base = createDefaultConfig();
    const merged = mergeConfig(base, { autoBackup: false });
    expect(merged.preferences.autoBackup).toBe(false);
  });

  // ✅ Positive: overrides all fields simultaneously
  test('overrides all fields when all are provided', () => {
    const base = createDefaultConfig();
    const merged = mergeConfig(base, {
      yoloMode: true,
      autoBackup: false,
      expertMode: false,
      useAgentSwarm: false,
      maxParallelAgents: 8,
      maxApiCallsPerSession: 1000,
    });
    expect(merged.preferences.yoloMode).toBe(true);
    expect(merged.preferences.autoBackup).toBe(false);
    expect(merged.preferences.expertMode).toBe(false);
    expect(merged.preferences.useAgentSwarm).toBe(false);
    expect(merged.preferences.maxParallelAgents).toBe(8);
    expect(merged.preferences.maxApiCallsPerSession).toBe(1000);
  });

  // ❌ Negative: does not mutate the base config
  test('does not mutate the base config', () => {
    const base = createDefaultConfig();
    mergeConfig(base, { yoloMode: true });
    expect(base.preferences.yoloMode).toBe(false);
  });

  // ❌ Negative: empty overrides returns equivalent config
  test('empty overrides returns config with same preference values', () => {
    const base = createDefaultConfig();
    const merged = mergeConfig(base, {});
    expect(merged.preferences.yoloMode).toBe(base.preferences.yoloMode);
    expect(merged.preferences.autoBackup).toBe(base.preferences.autoBackup);
    expect(merged.preferences.expertMode).toBe(base.preferences.expertMode);
    expect(merged.preferences.useAgentSwarm).toBe(base.preferences.useAgentSwarm);
    expect(merged.preferences.maxParallelAgents).toBe(base.preferences.maxParallelAgents);
    expect(merged.preferences.maxApiCallsPerSession).toBe(base.preferences.maxApiCallsPerSession);
  });
});

// ── isYoloMode ────────────────────────────────────────────────────────────────
// Note: isYoloMode also checks process.env.CI — we test both branches.

describe('isYoloMode', () => {
  // ✅ Positive: returns true when yoloMode preference is true
  test('returns true when config.preferences.yoloMode is true', () => {
    // Arrange
    const config = mergeConfig(createDefaultConfig(), { yoloMode: true });
    // Act & Assert
    // Temporarily clear CI to isolate the preference check
    const savedCI = process.env['CI'];
    delete process.env['CI'];
    try {
      expect(isYoloMode(config)).toBe(true);
    } finally {
      if (savedCI !== undefined) process.env['CI'] = savedCI;
    }
  });

  // ✅ Positive: returns true when CI env var is "true" (even if preference is false)
  test('returns true when process.env.CI is "true"', () => {
    const config = createDefaultConfig(); // yoloMode: false
    const savedCI = process.env['CI'];
    process.env['CI'] = 'true';
    try {
      expect(isYoloMode(config)).toBe(true);
    } finally {
      if (savedCI !== undefined) {
        process.env['CI'] = savedCI;
      } else {
        delete process.env['CI'];
      }
    }
  });

  // ❌ Negative: returns false when yoloMode is false and CI is not set
  test('returns false when yoloMode is false and CI is not "true"', () => {
    const config = createDefaultConfig(); // yoloMode: false
    const savedCI = process.env['CI'];
    delete process.env['CI'];
    try {
      expect(isYoloMode(config)).toBe(false);
    } finally {
      if (savedCI !== undefined) process.env['CI'] = savedCI;
    }
  });
});

// ── isAutoBackup ──────────────────────────────────────────────────────────────

describe('isAutoBackup', () => {
  // ✅ Positive: returns true when autoBackup is true
  test('returns true when autoBackup preference is true', () => {
    const config = createDefaultConfig(); // autoBackup: true
    expect(isAutoBackup(config)).toBe(true);
  });

  // ❌ Negative: returns false when autoBackup is false
  test('returns false when autoBackup preference is false', () => {
    const config = mergeConfig(createDefaultConfig(), { autoBackup: false });
    expect(isAutoBackup(config)).toBe(false);
  });
});

// ── readConfig / writeConfig (I/O round-trip) ─────────────────────────────────

describe('readConfig / writeConfig', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'oac-config-test-'));
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // ✅ Positive: readConfig returns null when no config file exists
  test('readConfig returns null when config file does not exist', async () => {
    // Arrange — fresh tmpDir has no .oac/config.json
    const emptyDir = join(tmpDir, 'empty');
    // Act
    const result = await readConfig(emptyDir);
    // Assert
    expect(result).toBeNull();
  });

  // ✅ Positive: writeConfig creates .oac/ dir and writes the file
  test('writeConfig creates .oac/ directory and writes config.json', async () => {
    // Arrange
    const projectRoot = join(tmpDir, 'write-test');
    const config = createDefaultConfig();
    // Act
    await writeConfig(projectRoot, config);
    // Assert — file should now exist
    const configPath = getConfigPath(projectRoot);
    expect(await Bun.file(configPath).exists()).toBe(true);
  });

  // ✅ Positive: round-trip — write then read returns the same config
  test('writeConfig then readConfig round-trips the default config', async () => {
    // Arrange
    const projectRoot = join(tmpDir, 'roundtrip-default');
    const original = createDefaultConfig();
    // Act
    await writeConfig(projectRoot, original);
    const read = await readConfig(projectRoot);
    // Assert
    expect(read).not.toBeNull();
    expect(read?.version).toBe('1');
    expect(read?.preferences.yoloMode).toBe(false);
    expect(read?.preferences.autoBackup).toBe(true);
    expect(read?.preferences.expertMode).toBe(true);
    expect(read?.preferences.useAgentSwarm).toBe(true);
    expect(read?.preferences.maxParallelAgents).toBe(2);
    expect(read?.preferences.maxApiCallsPerSession).toBe(500);
  });

  // ✅ Positive: round-trip preserves non-default preference values
  test('writeConfig then readConfig round-trips a modified config', async () => {
    // Arrange
    const projectRoot = join(tmpDir, 'roundtrip-modified');
    const config = mergeConfig(createDefaultConfig(), {
      yoloMode: true,
      autoBackup: false,
      expertMode: false,
      useAgentSwarm: false,
      maxParallelAgents: 8,
      maxApiCallsPerSession: 1000,
    });
    // Act
    await writeConfig(projectRoot, config);
    const read = await readConfig(projectRoot);
    // Assert
    expect(read?.preferences.yoloMode).toBe(true);
    expect(read?.preferences.autoBackup).toBe(false);
    expect(read?.preferences.expertMode).toBe(false);
    expect(read?.preferences.useAgentSwarm).toBe(false);
    expect(read?.preferences.maxParallelAgents).toBe(8);
    expect(read?.preferences.maxApiCallsPerSession).toBe(1000);
  });

  // ✅ Positive: writeConfig is idempotent — second write overwrites first
  test('second writeConfig call overwrites the first', async () => {
    // Arrange
    const projectRoot = join(tmpDir, 'overwrite-test');
    const first = createDefaultConfig();
    const second = mergeConfig(createDefaultConfig(), { yoloMode: true });
    // Act
    await writeConfig(projectRoot, first);
    await writeConfig(projectRoot, second);
    const read = await readConfig(projectRoot);
    // Assert
    expect(read?.preferences.yoloMode).toBe(true);
  });

  // ❌ Negative: readConfig throws for invalid JSON structure
  test('readConfig throws an error when config JSON is structurally invalid', async () => {
    // Arrange — write a config with a bad version field
    const projectRoot = join(tmpDir, 'bad-config');
    const configPath = getConfigPath(projectRoot);
    // Create the .oac/ directory first (Bun.write does not auto-create parent dirs)
    await mkdir(dirname(configPath), { recursive: true });
    // Write invalid config (version must be literal "1")
    await Bun.write(configPath, JSON.stringify({ version: '99', preferences: {} }));
    // Act & Assert
    await expect(readConfig(projectRoot)).rejects.toThrow();
  });

  // ❌ Negative: readConfig throws for missing required fields
  test('readConfig throws when preferences field is missing', async () => {
    // Arrange
    const projectRoot = join(tmpDir, 'missing-prefs');
    const configPath = getConfigPath(projectRoot);
    await mkdir(dirname(configPath), { recursive: true });
    await Bun.write(configPath, JSON.stringify({ version: '1' }));
    // Act & Assert
    await expect(readConfig(projectRoot)).rejects.toThrow();
  });

  // ❌ Negative: readConfig throws for wrong preference types
  test('readConfig throws when preference values have wrong types', async () => {
    // Arrange
    const projectRoot = join(tmpDir, 'wrong-types');
    const configPath = getConfigPath(projectRoot);
    await mkdir(dirname(configPath), { recursive: true });
    await Bun.write(
      configPath,
      JSON.stringify({
        version: '1',
        preferences: {
          yoloMode: 'yes',
          autoBackup: 1,
          expertMode: 'yes',
          useAgentSwarm: 1,
          maxParallelAgents: 'eight',
          maxApiCallsPerSession: 'many',
        },
      }),
    );
    // Act & Assert
    await expect(readConfig(projectRoot)).rejects.toThrow();
  });
});

// ── isExpertMode ──────────────────────────────────────────────────────────────

describe('isExpertMode', () => {
  // ✅ Positive: returns true when expertMode preference is true
  test('returns true when config.preferences.expertMode is true', () => {
    const config = createDefaultConfig(); // expertMode: true
    expect(isExpertMode(config)).toBe(true);
  });

  // ❌ Negative: returns false when expertMode preference is false
  test('returns false when config.preferences.expertMode is false', () => {
    const config = mergeConfig(createDefaultConfig(), { expertMode: false });
    expect(isExpertMode(config)).toBe(false);
  });
});

// ── isAgentSwarmEnabled ───────────────────────────────────────────────────────

describe('isAgentSwarmEnabled', () => {
  // ✅ Positive: returns true when both expertMode and useAgentSwarm are true
  test('returns true when both expertMode and useAgentSwarm are true', () => {
    const config = createDefaultConfig(); // both true by default
    expect(isAgentSwarmEnabled(config)).toBe(true);
  });

  // ❌ Negative: returns false when expertMode is false
  test('returns false when expertMode is false', () => {
    const config = mergeConfig(createDefaultConfig(), { expertMode: false });
    expect(isAgentSwarmEnabled(config)).toBe(false);
  });

  // ❌ Negative: returns false when useAgentSwarm is false
  test('returns false when useAgentSwarm is false', () => {
    const config = mergeConfig(createDefaultConfig(), { useAgentSwarm: false });
    expect(isAgentSwarmEnabled(config)).toBe(false);
  });

  // ❌ Negative: returns false when both are false
  test('returns false when both expertMode and useAgentSwarm are false', () => {
    const config = mergeConfig(createDefaultConfig(), {
      expertMode: false,
      useAgentSwarm: false,
    });
    expect(isAgentSwarmEnabled(config)).toBe(false);
  });
});

// ── getMaxParallelAgents ──────────────────────────────────────────────────────

describe('getMaxParallelAgents', () => {
  // ✅ Positive: returns default value (2)
  test('returns default maxParallelAgents (2)', () => {
    const config = createDefaultConfig();
    expect(getMaxParallelAgents(config)).toBe(2);
  });

  // ✅ Positive: returns overridden value
  test('returns overridden maxParallelAgents', () => {
    const config = mergeConfig(createDefaultConfig(), { maxParallelAgents: 8 });
    expect(getMaxParallelAgents(config)).toBe(8);
  });
});

// ── getMaxApiCallsPerSession ──────────────────────────────────────────────────

describe('getMaxApiCallsPerSession', () => {
  // ✅ Positive: returns default value (500)
  test('returns default maxApiCallsPerSession (500)', () => {
    const config = createDefaultConfig();
    expect(getMaxApiCallsPerSession(config)).toBe(500);
  });

  // ✅ Positive: returns overridden value
  test('returns overridden maxApiCallsPerSession', () => {
    const config = mergeConfig(createDefaultConfig(), { maxApiCallsPerSession: 1000 });
    expect(getMaxApiCallsPerSession(config)).toBe(1000);
  });
});
