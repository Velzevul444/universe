# Collaboration backend

The backend uses PostgreSQL for accounts, groups, memberships, invitations,
friends, note-level sharing, shared notes, CRDT snapshots, and a bounded update
history. Personal notes can be shared directly with an existing user as a reader
or editor, independently of groups. Yjs updates are synchronized over an
authenticated WebSocket at `/collab`.

## Local setup

1. Copy `.env.example` to `.env` and set `PGHOST`, `PGPORT`, `PGDATABASE`,
   `PGUSER`, and `PGPASSWORD` for a PostgreSQL role allowed to create databases.
2. Run `npm install`.
3. Run `npm run db:setup` to create the database and initialize or migrate its
   tables.
4. Run `npm start` to start the HTTP API and collaboration WebSocket.

Start the Vite application from `hah/` with `npm run dev`. The default frontend
origin is `http://localhost:4174`; set `CORS_ORIGIN` when using a different one.

Run `npm test` from this directory after database setup. The integration test
creates temporary accounts and removes them when it finishes.
