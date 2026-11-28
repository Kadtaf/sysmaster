import { Directory, File, Paths } from 'expo-file-system';
import type { KeyValueStore } from './cache';

/** Au-delà, les entrées les plus anciennes sont supprimées. */
const MAX_ENTRIES = 300;

/** Fichiers JSON dans le dossier privé de l'application (inaccessible aux autres applications). */
export class FileStore implements KeyValueStore {
  private readonly dir = new Directory(Paths.document, 'sysmaster-hors-ligne');

  private ensure() {
    if (!this.dir.exists) this.dir.create({ intermediates: true });
  }

  async get(key: string) {
    const file = new File(this.dir, `${key}.json`);
    return file.exists ? file.text() : null;
  }

  async set(key: string, value: string) {
    this.ensure();
    const file = new File(this.dir, `${key}.json`);
    if (!file.exists) file.create();
    await file.write(value);
    this.prune();
  }

  async clear() {
    if (this.dir.exists) this.dir.delete();
  }

  private prune() {
    const files = this.dir.list().filter((f): f is File => f instanceof File);
    if (files.length <= MAX_ENTRIES) return;
    files
      .map((f) => ({ f, t: f.info().modificationTime ?? 0 }))
      .sort((a, b) => a.t - b.t)
      .slice(0, files.length - MAX_ENTRIES)
      .forEach(({ f }) => f.delete());
  }
}
