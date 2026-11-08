# Split v4

Open `index.html` through an HTTPS static host, or use `python3 -m http.server` for local development at `http://localhost:8000/`. The browser must allow IndexedDB. The checked-in `js/vendor.js` contains Yjs, y-indexeddb and the Liveblocks client, so an offline reload does not need a package CDN or a build step. `npm run build:vendor` rebuilds it after dependency updates.

The group link is the capability. Anyone with it can read and change the group. Keep it among trusted friends. The bundled Liveblocks key is a public pilot key, so this is for invited use; monitor room quota and add a capability-check endpoint before a public launch.

The v4 archive is a JSON object with `format`, `schemaVersion`, `groupId`, `events`, and optional `legacyArchive`. Every event is a plain JSON object with six top-level fields: `schemaVersion`, `groupId`, `id`, `clock`, `type`, `data`. Money amounts are integer decimal strings and currency exponents are recorded in the group and expense payloads. Keep exports in a safe place: browser storage can be evicted.

Foreign expenses remain excluded from balances until someone enters a group amount. Automatic FX conversion is intentionally absent until its exact rounding policy is decided. The app never guesses a rate. The v3 migration screen requires a fully synced old room, downloads the binary archive, shows the legacy balance proposal and split drift, and requires a reviewed zero-sum opening vector. It writes a marker to the old room unless the old link may have leaked. Old expenses remain read-only in the archived Yjs document.

Links from the older root app (`#group=grp_…`) open a migration screen. On a browser that still has that group's `split_groups` local storage, v4 can archive the raw JSON and propose a reviewed opening vector. The old root app used JSONBin/ntfy rather than v3's Yjs room, so its link alone cannot recover data on a new device. The migration does not alter or delete the old local data. Keep the archive download and share only the new v4 link after review.

Run `npm test` for ledger, migration, and local archive tests. Before claiming the 30-day offline target, run the full installed/tab matrix on Android Chrome 120+, iOS Safari 17.4+, and desktop Chromium, including two reconnect orders and provider deletion/recovery. The elapsed 30-calendar-day field test and Liveblocks quota/cost pilot cannot be completed by local automated tests.
