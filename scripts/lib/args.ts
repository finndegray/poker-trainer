export function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key.startsWith('--')) {
      out[key.slice(2)] = argv[i + 1] ?? 'true';
      i++;
    }
  }
  return out;
}

export function numberArg(
  args: Record<string, string>,
  key: string,
  fallback: number,
  opts: { integer?: boolean; min?: number },
): number {
  const raw = args[key];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(value)) throw new Error(`--${key}: "${raw}" ist keine gültige Zahl`);
  if (opts.integer && !Number.isInteger(value)) throw new Error(`--${key}: ${value} ist keine ganze Zahl`);
  if (opts.min !== undefined && value < opts.min) throw new Error(`--${key}: ${value} ist zu klein (mindestens ${opts.min})`);
  return value;
}

export function assertKnownArgs(args: Record<string, string>, allowed: string[]): void {
  for (const key of Object.keys(args)) {
    if (!allowed.includes(key)) throw new Error(`Unbekannte Option --${key} (erlaubt: ${allowed.map((a) => `--${a}`).join(', ')})`);
  }
}
