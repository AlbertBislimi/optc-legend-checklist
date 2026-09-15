import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const META_PATH = resolve(ROOT_DIR, 'data/rumble-meta.json');
const OUTPUT_PATH = resolve(ROOT_DIR, 'data/rumble-meta-units.json');
const SOURCES = {
  units: 'https://2shankz.github.io/optc-db.github.io/common/data/units.js',
  tags: 'https://2shankz.github.io/optc-db.github.io/common/data/tags.js',
  version: 'https://2shankz.github.io/optc-db.github.io/common/data/version.js',
  rumble: 'https://2shankz.github.io/optc-db.github.io/common/data/rumble.json'
};

function uniqueStrings(value) {
  const found = new Set();

  function visit(entry) {
    if (Array.isArray(entry)) {
      entry.forEach(visit);
      return;
    }
    if (typeof entry === 'string' && entry.trim()) found.add(entry.trim());
  }

  visit(value);
  return [...found];
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstTier(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normaliseClasses(value) {
  return uniqueStrings(value);
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      headers: { 'user-agent': 'optc-legend-locker-rumble-meta/1.0' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function runDataScript(source, filename) {
  const sandbox = { window: {} };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename, timeout: 10000 });
  return sandbox;
}

function collectReferencedIds(meta) {
  const ids = new Set();
  (meta.teams || []).forEach((team) => {
    (team.slots || []).forEach((slot) => {
      [slot.unitId].concat(slot.alternatives || []).forEach((id) => {
        const numericId = Number(id);
        if (Number.isInteger(numericId) && numericId > 0) ids.add(numericId);
      });
    });
  });
  return [...ids].sort((left, right) => left - right);
}

function buildUnitSnapshot(id, unit, tagMap, rumbleEntry) {
  const stats = rumbleEntry && rumbleEntry.stats && typeof rumbleEntry.stats === 'object'
    ? rumbleEntry.stats
    : {};
  const special = firstTier(rumbleEntry && rumbleEntry.special);
  const ability = firstTier(rumbleEntry && rumbleEntry.ability);
  const cooldown = rumbleEntry && rumbleEntry.cooldown !== undefined
    ? rumbleEntry.cooldown
    : special && special.cooldown;

  return {
    id,
    name: unit && unit.name ? String(unit.name) : `Unit #${id}`,
    type: unit && unit.type ? String(unit.type) : null,
    classes: normaliseClasses(unit && unit.class),
    tags: uniqueStrings(tagMap && tagMap[id]),
    missingFromUnitData: !unit,
    stats: {
      style: stats.rumbleType ? String(stats.rumbleType) : null,
      attack: toNumber(stats.atk),
      defense: toNumber(stats.def),
      speed: toNumber(stats.spd),
      cost: toNumber(rumbleEntry && rumbleEntry.cost),
      specialCooldown: toNumber(cooldown)
    },
    hasRumbleData: Boolean(rumbleEntry && (ability || special || cooldown !== undefined))
  };
}

function withoutGeneratedAt(snapshot) {
  const { generatedAt, ...stable } = snapshot;
  return stable;
}

async function readPreviousSnapshot() {
  try {
    return JSON.parse(await readFile(OUTPUT_PATH, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function main() {
  const meta = JSON.parse(await readFile(META_PATH, 'utf8'));
  const ids = collectReferencedIds(meta);
  if (!ids.length) throw new Error('No PvP units were referenced in data/rumble-meta.json.');

  console.log(`Refreshing ${ids.length} referenced PvP units…`);
  const [unitsSource, tagsSource, versionSource, rumbleSource] = await Promise.all([
    fetchText(SOURCES.units),
    fetchText(SOURCES.tags),
    fetchText(SOURCES.version),
    fetchText(SOURCES.rumble)
  ]);

  const unitsSandbox = runDataScript(unitsSource, 'units.js');
  const tagsSandbox = runDataScript(tagsSource, 'tags.js');
  const versionSandbox = runDataScript(versionSource, 'version.js');
  const unitMap = unitsSandbox.window.units || {};
  const tagMap = tagsSandbox.window.tags || {};
  const rumblePayload = JSON.parse(rumbleSource);
  const rumbleRecords = Array.isArray(rumblePayload)
    ? rumblePayload
    : (Array.isArray(rumblePayload.units) ? rumblePayload.units : []);
  const rumbleMap = rumbleRecords.reduce((all, entry) => {
    if (entry && Number.isInteger(Number(entry.id))) all[Number(entry.id)] = entry;
    return all;
  }, {});

  if (!Object.keys(unitMap).length || !Object.keys(rumbleMap).length) {
    throw new Error('The upstream OPTC DB payloads did not contain unit or Rumble data.');
  }

  const missingIds = ids.filter((id) => !unitMap[id]);
  if (missingIds.length) {
    console.warn(`Warning: ${missingIds.length} configured unit(s) were absent upstream: ${missingIds.join(', ')}`);
  }

  const units = {};
  ids.forEach((id) => {
    units[id] = buildUnitSnapshot(id, unitMap[id], tagMap, rumbleMap[id]);
  });

  const next = {
    schemaVersion: 1,
    metaSchemaVersion: meta.schemaVersion || 1,
    upstream: {
      dbVersion: versionSandbox.window.dbVersion || versionSandbox.dbVersion || null,
      fetchedFrom: SOURCES
    },
    generatedAt: new Date().toISOString(),
    units
  };
  const previous = await readPreviousSnapshot();

  if (previous && JSON.stringify(withoutGeneratedAt(previous)) === JSON.stringify(withoutGeneratedAt(next))) {
    console.log('No Rumble unit stat or tag changes found.');
    return;
  }

  await writeFile(OUTPUT_PATH, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(`Unable to refresh Rumble meta data: ${error.message}`);
  process.exitCode = 1;
});
