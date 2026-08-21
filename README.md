# Home Dashboard

A self-hosted Angular dashboard for Home Assistant, backed by a small Node.js server. A fresh installation contains one empty room, no entity IDs, no photographs, and no Home Assistant credentials.

## Quick start

Requires Node.js 20 or 22 LTS.

```bash
npm run dev
```

- Angular interface: `http://localhost:4200`
- Node API: `http://localhost:3000/api`
- Open administration: hold the clock for 1.5 seconds
- Development PIN: `2580`

Set a unique PIN before exposing the server on a network:

```bash
ADMIN_PIN=your-unique-pin npm run dev
```

From the administration panel, connect Home Assistant with its URL and a long-lived access token. Then create floors and rooms, select entities, and upload optional room backgrounds. Changes are written to the server and become available to every authorized dashboard device.

## Local data and privacy

Runtime configuration is deliberately kept outside Git:

- `data/homes/`: floors, rooms, entity IDs, and interface settings
- `data/secrets/`: hashed admin PIN, authorized-device hashes, Home Assistant URL and token
- `data/uploads/`: user-uploaded room photographs
- `data/backups/`: automatic configuration backups
- `data/cache/`: downloaded icon metadata

All these paths are ignored by Git and excluded from the Docker build context. The Home Assistant token is accepted only by the Node server, saved with file mode `0600`, and never returned to the browser. The browser connects through the server-side WebSocket proxy.

`defaults/main.json` is the only configuration shipped with the project. Keep it generic and free of entity IDs or personal data.

## Production

Build the Angular application and run the integrated server:

```bash
npm run build
ADMIN_PIN=your-unique-pin npm start
```

Run it behind HTTPS and keep the persistent `data/` directory outside the application image. For the Home Assistant app image, `/data/dashboard` is used as persistent storage.

## Updating

Application updates replace the code and public default only. Existing configuration, secrets, uploads, and backups stay in the persistent data directory. Configuration writes are atomic and the previous version is backed up automatically.

## Before publishing a fork

Run `git status --ignored` and verify that no file under the local runtime paths above is staged. If private files existed in earlier commits, publish from a clean repository or purge those paths from Git history before making the repository public; `.gitignore` only protects future commits.
