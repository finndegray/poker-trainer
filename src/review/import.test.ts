import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { getPushFoldData } from '../app/data';
import { ANALYSIS_VERSION } from './analysis';
import { memoryReviewBackend, tournamentKey, writeRecords } from './archive';
import bounty from './fixtures/bounty.txt?raw';
import dailyClassic from './fixtures/daily-classic.txt?raw';
import steps from './fixtures/step-satellites.txt?raw';
import {
  HANDS_PER_CHUNK,
  ImportLimitError,
  MAX_FILE_BYTES,
  MAX_HANDS_PER_IMPORT,
  MAX_UNZIPPED_BYTES,
  MAX_ZIP_ENTRIES,
  type ImportProgress,
  analyzePlan,
  countSkipped,
  extractTexts,
  handRecordOf,
  planImport,
  tournamentRecordOf,
  writeFailureMessage,
} from './import';
import { parseHand } from './parse';

const file = (name: string, text: string) => ({ name, bytes: strToU8(text) });
const texts = (...list: string[]) => list.map((text, i) => ({ name: `f${i}.txt`, text }));

describe('extractTexts', () => {
  it('reads .txt files and the .txt entries of a ZIP', () => {
    const zip = zipSync({ 'a.txt': strToU8(dailyClassic), 'b/c.txt': strToU8(bounty), 'notes.pdf': strToU8('%PDF') });
    const result = extractTexts([{ name: 'hands.zip', bytes: zip }, file('steps.txt', steps)]);
    expect(result.texts.map((t) => t.name)).toEqual(['a.txt', 'b/c.txt', 'steps.txt']);
    expect(result.texts[0].text).toBe(dailyClassic);
    expect(result.skipped).toEqual([]);
  });

  it('recognises a ZIP by its signature even without the extension', () => {
    const zip = zipSync({ 'a.txt': strToU8(bounty) });
    expect(extractTexts([{ name: 'download', bytes: zip }]).texts).toHaveLength(1);
  });

  it('reports unsupported, broken and too big files', () => {
    const big = { name: 'big.txt', bytes: new Uint8Array(MAX_FILE_BYTES + 1) };
    const broken = { name: 'broken.zip', bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]) };
    expect(extractTexts([file('bild.png', 'x'), big, broken]).skipped).toEqual([
      { id: 'bild.png', reason: 'Dateityp nicht unterstützt (nur .txt und .zip)' },
      { id: 'big.txt', reason: 'Datei zu groß (über 20 MB)' },
      { id: 'broken.zip', reason: 'ZIP-Datei nicht lesbar' },
    ]);
  });

  it('rejects a ZIP whose entries unpack to more than the aggregate cap, without importing anything', () => {
    const chunk = new Uint8Array(18 * 1024 * 1024);
    const zip = zipSync({ 'a.txt': chunk, 'b.txt': chunk, 'c.txt': chunk, 'd.txt': strToU8(bounty) });
    expect(MAX_UNZIPPED_BYTES).toBe(50 * 1024 * 1024);
    const result = extractTexts([{ name: 'bomb.zip', bytes: zip }]);
    expect(result.texts).toEqual([]);
    expect(result.skipped).toEqual([{ id: 'bomb.zip', reason: 'ZIP entpackt zu groß (über 50 MB)' }]);
  });

  it('rejects a ZIP with too many entries', () => {
    const entries: Record<string, Uint8Array> = {};
    for (let i = 0; i <= MAX_ZIP_ENTRIES; i++) entries[`f${i}.txt`] = strToU8('x');
    const result = extractTexts([{ name: 'many.zip', bytes: zipSync(entries) }]);
    expect(result.texts).toEqual([]);
    expect(result.skipped).toEqual([{ id: 'many.zip', reason: 'ZIP enthält zu viele Dateien (über 1000)' }]);
  });

  it('accepts exactly the maximum number of entries', () => {
    const entries: Record<string, Uint8Array> = {};
    for (let i = 0; i < MAX_ZIP_ENTRIES; i++) entries[`f${i}.txt`] = strToU8('x');
    expect(extractTexts([{ name: 'ok.zip', bytes: zipSync(entries) }]).texts).toHaveLength(MAX_ZIP_ENTRIES);
  });

  it('silently ignores macOS junk entries and does not count them', () => {
    const zip = zipSync({ 'a.txt': strToU8(bounty), '__MACOSX/b.txt': strToU8('junk'), 'dir/._c.txt': strToU8('junk'), '__MACOSX/._a.txt': strToU8('junk') });
    const result = extractTexts([{ name: 'mac.zip', bytes: zip }]);
    expect(result.texts.map((t) => t.name)).toEqual(['a.txt']);
    expect(result.skipped).toEqual([]);
  });

  it('still imports a text file with a UTF-8 BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...strToU8(bounty)]);
    const result = extractTexts([{ name: 'bom.txt', bytes }]);
    expect(planImport(result.texts, new Set()).tournaments.size).toBeGreaterThan(0);
  });
});

describe('planImport', () => {
  it('groups hands by tournament across files and orders them by time', () => {
    const plan = planImport(texts(steps, dailyClassic), new Set());
    expect([...plan.tournaments.keys()]).toEqual(['318586851', '318586827', '318096259']);
    expect(plan.tournaments.get('318096259')!.map((h) => h.id)).toEqual([
      'TM6532800963', 'TM6532186101', 'TM6533069879', 'TM6533069892', 'TM6532734973', 'TM6532448269',
    ]);
  });

  it('skips hands that are archived or appear twice (the hand number is the key)', () => {
    const plan = planImport(texts(bounty, dailyClassic, bounty), new Set(['TM6532800963']));
    expect(plan.duplicates).toBe(2);
    expect([...plan.tournaments.values()].flat()).toHaveLength(6);
  });

  it('collects unreadable hands with their reason and goes on', () => {
    const plan = planImport(texts(`kaputt\n\n${bounty}`, bounty.replace('Hero', 'Villain').replace('TM6532114653', 'TM2')), new Set());
    expect(countSkipped(plan.skipped)).toEqual([
      { reason: 'Format nicht erkannt', count: 1 },
      { reason: 'kein Hero', count: 1 },
    ]);
    expect(plan.tournaments.size).toBe(1);
  });

  it('never touches a tournament whose archive record is unreadable', () => {
    const plan = planImport(texts(bounty), new Set(), new Set(['318083464']));
    expect(plan.tournaments.size).toBe(0);
    expect(plan.skipped).toEqual([{ id: 'TM6532114653', reason: 'Turnier im Archiv nicht lesbar' }]);
  });

  it('stops with a clear message above the hand limit', () => {
    expect(MAX_HANDS_PER_IMPORT).toBe(20_000);
    expect(() => planImport(texts(dailyClassic), new Set(), new Set(), 5)).toThrow(new ImportLimitError('Zu viele Hände: höchstens 5 je Import'));
  });
});

describe('analyzePlan', () => {
  it('rates in chunks and reports progress per tournament and hand', async () => {
    const plan = planImport(texts(steps, bounty), new Set());
    const progress: ImportProgress[] = [];
    let pauses = 0;
    const result = await analyzePlan(plan, getPushFoldData(), (p) => progress.push(p), async () => {
      pauses++;
    });
    expect([...result.keys()]).toEqual(['318586851', '318586827', '318083464']);
    expect(progress).toEqual([
      { tournament: 1, tournaments: 3, hand: 1, hands: 1 },
      { tournament: 1, tournaments: 3, hand: 1, hands: 1 },
      { tournament: 2, tournaments: 3, hand: 1, hands: 1 },
      { tournament: 2, tournaments: 3, hand: 1, hands: 1 },
      { tournament: 3, tournaments: 3, hand: 1, hands: 1 },
      { tournament: 3, tournaments: 3, hand: 1, hands: 1 },
    ]);
    expect(pauses).toBe(3);
    expect(HANDS_PER_CHUNK).toBe(25);
  });

  it('rates 500 hands well within 30 seconds', async () => {
    const hand = parseHand(bounty);
    const many = Array.from({ length: 500 }, (_, i) => hand.raw.replace('TM6532114653', `TM${900000 + i}`)).join('\n\n\n');
    const started = performance.now();
    const plan = planImport(texts(many), new Set());
    const result = await analyzePlan(plan, getPushFoldData(), () => {});
    const ms = performance.now() - started;
    expect(result.get('318083464')).toHaveLength(500);
    expect(ms).toBeLessThan(30_000);
  });
});

describe('records', () => {
  it('builds hand and tournament records and keeps a kind the player chose', () => {
    const hands = planImport(texts(steps), new Set()).tournaments.get('318586827')!;
    const records = hands.map((hand) => handRecordOf({ hand, analysis: { version: 1, decisions: [] } }));
    expect(records[0]).toMatchObject({ reviewSchemaVersion: 1, id: 'TM6532799440', tournamentId: '318586827', dateKey: '2026-10-13', analysisVersion: 1 });
    const fresh = tournamentRecordOf('318586827', '$0.50 Step to The Weekender', records, null);
    expect(fresh).toMatchObject({ detectedKind: 'satellit', kind: 'satellit', handIds: ['TM6532799440'], firstPlayedAt: '2026-10-13 11:31:49', analysisVersion: 1 });
    const current = records.map((r) => ({ ...r, analysisVersion: ANALYSIS_VERSION }));
    expect(tournamentRecordOf('318586827', 'x', current, null).analysisVersion).toBe(ANALYSIS_VERSION);
    const changed = tournamentRecordOf('318586827', 'egal', records, { ...fresh, kind: 'normal' });
    expect(changed).toMatchObject({ name: '$0.50 Step to The Weekender', detectedKind: 'satellit', kind: 'normal' });
    expect(tournamentRecordOf('318586827', 'x', records, fresh, 'bounty').kind).toBe('bounty');
  });
});

describe('writeFailureMessage', () => {
  const build = () => {
    const hands = planImport(texts(steps), new Set()).tournaments.get('318586827')!;
    const records = hands.map((hand) => handRecordOf({ hand, analysis: { version: 1, decisions: [] } }));
    return { records, tournament: tournamentRecordOf('318586827', '$0.50 Step to The Weekender', records, null) };
  };

  it('explains in German why an archived tournament of a newer version is not written, and writes nothing', async () => {
    const { records, tournament } = build();
    const newer = JSON.stringify({ ...tournament, reviewSchemaVersion: 2 });
    const backend = memoryReviewBackend({ [tournamentKey(tournament.id)]: newer });
    const error = await writeRecords(backend, [tournament], records).then(() => null, (e: unknown) => e);
    expect(writeFailureMessage(error, tournament.name)).toBe(
      'Turnier „$0.50 Step to The Weekender“ wurde nicht importiert: Es stammt aus einer neueren App-Version und bleibt unverändert.',
    );
    expect(backend.dump()).toEqual({ [tournamentKey(tournament.id)]: newer });
  });

  it('explains in German why an unreadable archived tournament blocks the import, and writes nothing', async () => {
    const { records, tournament } = build();
    const backend = memoryReviewBackend({ [tournamentKey(tournament.id)]: '{kaputt' });
    const error = await writeRecords(backend, [tournament], records).then(() => null, (e: unknown) => e);
    expect(writeFailureMessage(error, tournament.name)).toBe(
      'Turnier „$0.50 Step to The Weekender“ wurde nicht importiert: Der Archiv-Eintrag ist nicht lesbar und wird nicht überschrieben.',
    );
    expect(backend.dump()).toEqual({ [tournamentKey(tournament.id)]: '{kaputt' });
  });

  it('rethrows errors that are not archive format problems', () => {
    const failure = new Error('IndexedDB kaputt');
    expect(() => writeFailureMessage(failure, 'x')).toThrow(failure);
  });
});
