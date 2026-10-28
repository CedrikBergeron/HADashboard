import { mkdir, readFile, writeFile, rename, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export class ConfigurationError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

// The main configuration remains in homes/main.json for existing installations.
// Named configurations are independent server documents; selecting one is per tablet.
export function configurationStore({ directory, readMain, saveMain, validHome }) {
  const pathFor = (id) => {
    if (!/^cfg-[a-f0-9-]{36}$/.test(id)) throw new ConfigurationError('Configuration introuvable.', 404);
    return join(directory, `${id}.json`);
  };
  const validate = (dashboard) => {
    if (!validHome(dashboard) || !dashboard.rooms.length || !Array.isArray(dashboard.floors) || !dashboard.floors.length
      || dashboard.floors.some((floor) => !floor || !/^[a-z0-9-]+$/.test(floor.id) || typeof floor.name !== 'string')
      || new Set(dashboard.floors.map((floor) => floor.id)).size !== dashboard.floors.length
      || dashboard.rooms.some((room) => !dashboard.floors.some((floor) => floor.id === room.floor))
      || !dashboard.settings || typeof dashboard.settings !== 'object') {
      throw new ConfigurationError('Configuration invalide : vérifiez les pièces, étages et réglages.');
    }
    const validEntity = (entity) => typeof entity === 'string';
    if (dashboard.rooms.some((room) =>
      (room.controls != null && (!Array.isArray(room.controls) || room.controls.some((control) => !control || typeof control.id !== 'string' || typeof control.label !== 'string' || !validEntity(control.entityId) || typeof control.icon !== 'string')))
      || (room.background != null && (typeof room.background !== 'object' || typeof room.background.url !== 'string'))
      || (room.climate != null && (typeof room.climate !== 'object' || !validEntity(room.climate.entityId)))
      || (room.vacuum != null && (typeof room.vacuum !== 'object' || !validEntity(room.vacuum.entityId))))) {
      throw new ConfigurationError('Les contrôles ou équipements de la configuration sont invalides.');
    }
    const security = dashboard.settings.security;
    if (security != null && (typeof security !== 'object'
      || (security.cameras != null && (!Array.isArray(security.cameras) || security.cameras.some((camera) => !camera || !validEntity(camera.entityId))))
      || (security.accessPoints != null && (!Array.isArray(security.accessPoints) || security.accessPoints.some((point) => !point || typeof point.name !== 'string'))))) {
      throw new ConfigurationError('Les réglages de sécurité de la configuration sont invalides.');
    }
    return { ...dashboard, id: 'main' };
  };
  const validName = (name) => {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) throw new ConfigurationError('Un nom de 1 à 80 caractères est requis.');
    return name.trim();
  };
  const write = async (id, value) => {
    await mkdir(directory, { recursive: true });
    const path = pathFor(id);
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
    await rename(temporary, path);
  };
  const read = async (id, includeArchived = false) => {
    if (id === 'main') return { id, name: 'Configuration principale', dashboard: await readMain() };
    let value;
    try { value = JSON.parse(await readFile(pathFor(id), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') throw new ConfigurationError('Configuration introuvable.', 404); throw error; }
    if (value.archivedAt && !includeArchived) throw new ConfigurationError('Cette configuration est archivée.', 404);
    return value;
  };
  const summary = ({ dashboard, ...entry }) => ({ ...entry, roomCount: dashboard.rooms.length, homeName: dashboard.settings?.homeName || dashboard.name });
  return {
    read,
    async list() {
      await mkdir(directory, { recursive: true });
      const main = await read('main');
      const entries = await Promise.all((await readdir(directory)).filter((file) => /^cfg-[a-f0-9-]{36}\.json$/.test(file)).map((file) => read(file.slice(0, -5), true)));
      return [summary(main), ...entries.map(summary).sort((a, b) => a.name.localeCompare(b.name))];
    },
    async create(name, dashboard) {
      const now = new Date().toISOString();
      const value = { id: `cfg-${randomUUID()}`, name: validName(name), createdAt: now, updatedAt: now, dashboard: validate(dashboard) };
      await write(value.id, value);
      return summary(value);
    },
    async save(id, dashboard) {
      const valid = validate(dashboard);
      if (id === 'main') { await saveMain(valid); return; }
      const value = await read(id);
      // Keep a separate history for each named configuration.
      const history = join(directory, 'history', id);
      await mkdir(history, { recursive: true });
      await writeFile(join(history, `${Date.now()}-${randomUUID()}.json`), JSON.stringify(value), { mode: 0o600 });
      const cutoff = Date.now() - 30 * 86400_000;
      // History retention matches the legacy automatic backups.
      for (const file of await readdir(history)) {
        if ((await stat(join(history, file))).mtimeMs < cutoff) {
          await unlink(join(history, file));
        }
      }
      await write(id, { ...value, dashboard: valid, updatedAt: new Date().toISOString() });
    },
    async rename(id, name) {
      if (id === 'main') throw new ConfigurationError('Dupliquez la configuration principale pour lui donner un autre nom.');
      const value = await read(id);
      await write(id, { ...value, name: validName(name), updatedAt: new Date().toISOString() });
    },
    async archive(id, archived) {
      if (id === 'main') throw new ConfigurationError('La configuration principale doit rester disponible.');
      const value = await read(id, true);
      await write(id, { ...value, archivedAt: archived ? new Date().toISOString() : null });
    },
    async backups(id) {
      await read(id);
      const history = join(directory, 'history', id);
      let files;
      try { files = await readdir(history); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
      const rows = await Promise.all(files.filter((file) => file.endsWith('.json')).map(async (file) => {
        const info = await stat(join(history, file));
        return { id: file, createdAt: info.mtime.toISOString(), size: info.size };
      }));
      return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50);
    },
    async restore(id, backupId) {
      await read(id);
      if (!/^\d+-[a-f0-9-]{36}\.json$/.test(backupId)) throw new ConfigurationError('Sauvegarde invalide.');
      let value;
      try { value = JSON.parse(await readFile(join(directory, 'history', id, backupId), 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') throw new ConfigurationError('Sauvegarde introuvable.', 404); throw error; }
      await this.save(id, value.dashboard);
    }
  };
}
