import fs from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';

function tryLoadEnvFile(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) {
      return false;
    }

    dotenv.config({ path: filePath, override: false });
    return true;
  } catch {
    return false;
  }
}

function resolveFromCwd(inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath);
}

const explicit = process.env.GCHAT_ENV_FILE;
if (explicit) {
  tryLoadEnvFile(resolveFromCwd(explicit));
} else {
  const cwd = process.cwd();
  tryLoadEnvFile(path.join(cwd, '.env')) ||
    tryLoadEnvFile(path.join(cwd, '..', '.env')) ||
    tryLoadEnvFile(path.join(cwd, '..', '..', '.env'));
}
