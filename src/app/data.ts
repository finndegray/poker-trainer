import raw from '../data/pushfold.json';
import { type PushFoldData, parsePushFoldData } from '../engine/pushfold-data';

let cached: PushFoldData | null = null;

export function getPushFoldData(): PushFoldData {
  cached ??= parsePushFoldData(raw);
  return cached;
}
