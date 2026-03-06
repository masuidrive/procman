import { fileURLToPath } from 'url';
import * as path from 'path';
import * as fs from 'fs';

export function findPackageJson(): { version: string } {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (dir !== path.dirname(dir)) {
    const candidate = path.join(dir, 'package.json');
    if (fs.existsSync(candidate)) {
      return JSON.parse(fs.readFileSync(candidate, 'utf8'));
    }
    dir = path.dirname(dir);
  }
  return { version: '0.0.0' };
}
