import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import routers from './user.controller.js';
import cors from 'cors';
import { closeDatabase, initializeDatabase } from './user.service.js';
import { attachCollaboration } from './collaboration.js';

const app = express();

app.use(cors({
	origin: process.env.CORS_ORIGIN || 'http://localhost:4174',
}));
app.use(express.json({ limit: '1mb' }));
app.use('/registretion', routers);

app.use((error, req, res, next) => {
	console.error(error);
	res.status(error.status || 500).json({
		error: error.status ? error.message : 'Внутренняя ошибка сервера.',
	});
});

async function main() {
	console.log('Connecting to PostgreSQL...');
	await initializeDatabase();
	console.log('PostgreSQL schema is ready.');
	const server = createServer(app);
	const collaboration = attachCollaboration(server);
	const port = Number(process.env.PORT || 3000);
	server.listen(port, () => {
		console.log(`API server listening on http://localhost:${port}`);
	});

	const shutdown = async () => {
		for (const socket of collaboration.clients) socket.close(1001, 'Server shutting down');
		server.close(async () => {
			await closeDatabase();
			process.exit(0);
		});
	};
	process.once('SIGINT', shutdown);
	process.once('SIGTERM', shutdown);
}

main().catch((error) => {
	console.error('Failed to start API server:', error);
	closeDatabase()
		.catch((closeError) => {
			console.error('Failed to close the PostgreSQL connection pool:', closeError);
		})
		.finally(() => {
			process.exitCode = 1;
		});
});
