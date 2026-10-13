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
