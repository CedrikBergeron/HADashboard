import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configurationStore } from './configurations.mjs';

const dashboard = { id: 'main', name: 'Maison', floors: [{ id: 'main', name: 'RDC' }], rooms: [{ id: 'kitchen', name: 'Cuisine', floor: 'main' }], settings: { homeName: 'Maison' }, dashboardDefaults: { roomId: 'kitchen', floorId: 'main' } };
const validHome = (value) => value && Array.isArray(value.rooms) && value.rooms.every((room) => typeof room.name === 'string' && /^[a-z0-9-]+$/.test(room.id));

test('independent configurations, durable reload, own history, archive and restore', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dashboard-config-test-'));
  let main = structuredClone(dashboard);
  const options = { directory, readMain: async () => main, saveMain: async (value) => main = value, validHome };
  try {
    const store = configurationStore(options);
    const first = await store.create('Cuisine', dashboard);
    const second = await store.create('Entrée', (await store.read(first.id)).dashboard);
    const edited = structuredClone(dashboard); edited.rooms[0].name = 'Cuisine modifiée';
    await store.save(first.id, edited);
    assert.equal((await store.read(second.id)).dashboard.rooms[0].name, 'Cuisine');
    assert.equal(main.rooms[0].name, 'Cuisine');
    assert.equal((await configurationStore(options).read(first.id)).dashboard.rooms[0].name, 'Cuisine modifiée');
    const history = await store.backups(first.id);
    assert.equal(history.length, 1);
    assert.equal((await store.backups(second.id)).length, 0);
    await store.restore(first.id, history[0].id);
    assert.equal((await store.read(first.id)).dashboard.rooms[0].name, 'Cuisine');
    assert.equal((await store.backups(first.id)).length, 2);
    await store.rename(first.id, 'Écran cuisine');
    await store.archive(first.id, true);
    await assert.rejects(store.read(first.id), { status: 404 });
    assert.ok((await store.list()).find((entry) => entry.id === first.id).archivedAt);
    await store.archive(first.id, false);
    assert.equal((await store.read(first.id)).name, 'Écran cuisine');
    assert.equal((await store.read(first.id)).dashboard.dashboardDefaults.roomId, 'kitchen');
    await assert.rejects(store.archive('main', true), { status: 400 });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('reject invalid imports, names, floor references and path traversal', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dashboard-config-test-'));
  const store = configurationStore({ directory, readMain: async () => dashboard, saveMain: async () => {}, validHome });
  try {
    await assert.rejects(store.create('', dashboard), { status: 400 });
    await assert.rejects(store.create('Invalid', { rooms: [] }), { status: 400 });
    await assert.rejects(store.create('Invalid', { ...dashboard, floors: [{ id: 'other', name: 'Autre' }] }), { status: 400 });
    await assert.rejects(store.read('../../secrets'), { status: 404 });
    assert.equal((await store.list()).length, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
