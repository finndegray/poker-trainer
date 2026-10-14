import { describe, expect, it } from 'vitest';
import { deserialize, emptyState, serialize } from '../storage/schema';
import { TODAY_SAVE } from '../storage/test-saves';
import { type ArchiveExport, EXPORT_KEY, readArchivePart, withArchive } from './export';
import { SITUATION_TOURNAMENTS } from './situation-tournaments';

const part: ArchiveExport = {
  reviewSchemaVersion: 1,
  tournaments: [{ id: '1', name: 'Daily Classic $1', kind: 'normal' }],
  hands: [{ id: 'TM1', tournamentId: '1', raw: 'Poker Hand #TM1: …' }],
};

describe('export with archive part', () => {
  it('leaves the export unchanged without an archive', () => {
    expect(withArchive(TODAY_SAVE, null)).toBe(TODAY_SAVE);
    expect(readArchivePart(TODAY_SAVE)).toBeNull();
  });

  it('appends the archive as an extra key that the save loader ignores', () => {
    const text = withArchive(TODAY_SAVE, part);
    expect(JSON.parse(text)[EXPORT_KEY]).toEqual(part);
    expect(serialize(deserialize(text))).toBe(TODAY_SAVE);
    expect(readArchivePart(text)).toEqual(part);
  });

  it('rejects a broken or newer archive part', () => {
    const save = serialize(emptyState());
    const broken = withArchive(save, { ...part, hands: [{ id: 1 }] } as unknown as ArchiveExport);
    expect(() => readArchivePart(broken)).toThrow('Hand-Archiv in der Datei ist nicht lesbar');
    const newer = withArchive(save, { ...part, reviewSchemaVersion: 2 } as unknown as ArchiveExport);
    expect(() => readArchivePart(newer)).toThrow('Hand-Archiv stammt aus einer neueren Version – bitte die App aktualisieren');
    expect(readArchivePart('kein JSON')).toBeNull();
  });
});

describe('names of saved situations in the export (Plan 10)', () => {
  const id = SITUATION_TOURNAMENTS.normal.id;
  const named: ArchiveExport = {
    reviewSchemaVersion: 1,
    tournaments: [{ id, name: SITUATION_TOURNAMENTS.normal.name, kind: 'normal' }],
    hands: [{ id: 'SIT1', tournamentId: id, raw: 'Poker Hand #SIT1: …', name: 'AKo UTG · 25 BB' }],
  };

  it('carries the name of a hand', () => {
    expect(readArchivePart(withArchive(TODAY_SAVE, named))).toEqual(named);
  });

  it('rejects a broken name', () => {
    const broken = { ...named, hands: [{ ...named.hands[0], name: 7 }] } as unknown as ArchiveExport;
    expect(() => readArchivePart(withArchive(TODAY_SAVE, broken))).toThrow('Hand-Archiv in der Datei ist nicht lesbar');
  });
});
