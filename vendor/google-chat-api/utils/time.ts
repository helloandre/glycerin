
export function parseTimeToUsec(value: number | string): number | undefined {
  if (typeof value === 'number') {
    if (value < 1e10) return value * 1_000_000;
    if (value < 1e13) return value * 1_000;
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;

    if (/^\d+$/.test(trimmed)) {
      return parseTimeToUsec(parseInt(trimmed, 10));
    }

    const relativeMatch = trimmed.match(/^(\d+)(m|h|d|w)$/i);
    if (relativeMatch) {
      const amount = parseInt(relativeMatch[1], 10);
      const unit = relativeMatch[2].toLowerCase();
      const now = Date.now();
      let msAgo = 0;
      switch (unit) {
        case 'm': msAgo = amount * 60 * 1000; break;
        case 'h': msAgo = amount * 60 * 60 * 1000; break;
        case 'd': msAgo = amount * 24 * 60 * 60 * 1000; break;
        case 'w': msAgo = amount * 7 * 24 * 60 * 60 * 1000; break;
      }
      return (now - msAgo) * 1000;
    }

    const date = new Date(trimmed);
    if (!Number.isNaN(date.getTime())) {
      return date.getTime() * 1000;
    }
  }

  return undefined;
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Aborted');
  }
}

