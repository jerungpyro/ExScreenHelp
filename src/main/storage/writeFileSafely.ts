import { renameSync, writeFileSync } from 'node:fs'

/**
 * Writes a file so that a crash or power cut never leaves it half-written: the data goes to a
 * temporary file next to it first, which then replaces the original in one step.
 */
export function writeFileSafely(path: string, data: string | Buffer): void {
  const tempPath = `${path}.tmp`
  writeFileSync(tempPath, data)
  renameSync(tempPath, path)
}
