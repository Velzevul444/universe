import 'dotenv/config';
import pg from 'pg';

const database = process.env.PGDATABASE || 'universe_collab';
const username = process.env.PGUSER || process.env.USER;

if (!/^[a-z][a-z0-9_]{0,62}$/i.test(database)) {
	throw new Error('PGDATABASE must be a PostgreSQL identifier.');
}
if (!username || !/^[a-z_][a-z0-9_$]{0,62}$/i.test(username)) {
	throw new Error('Set PGUSER to a valid PostgreSQL role.');
}

const admin = new pg.Client({
	host: process.env.PGHOST || '127.0.0.1',
	port: Number(process.env.PGPORT || 5432),
	database: process.env.PGADMIN_DATABASE || 'postgres',
	user: username,
	password: process.env.PGPASSWORD,
});

try {
	await admin.connect();
	const { rows } = await admin.query(
		'SELECT 1 FROM pg_database WHERE datname = $1',
		[database],
	);
	if (!rows[0]) {
		await admin.query(`CREATE DATABASE "${database}" OWNER "${username}"`);
		console.log(`Created PostgreSQL database "${database}".`);
	} else {
		console.log(`PostgreSQL database "${database}" already exists.`);
	}
} finally {
	await admin.end();
}

process.env.PGDATABASE = database;
const { closeDatabase, initializeDatabase } = await import('./user.service.js');
try {
	await initializeDatabase();
	console.log(`Schema initialized in "${database}".`);
} finally {
	await closeDatabase();
}
