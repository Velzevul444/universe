import { WebSocket, WebSocketServer } from 'ws';
import * as Y from 'yjs';
import { getSessionUser } from './user.service.js';
import { loadCollaborativeNote, saveCollaborativeUpdate } from './user.service.js';

const MAX_UPDATE_SIZE = 5 * 1024 * 1024;
const rooms = new Map();
const connections = new Set();
const roomLoads = new Map();

function sendJson(socket, value) {
	if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value));
}

function broadcastPresence(room) {
	const participants = [...room.clients].map((client) => client.email);
	for (const client of room.clients) {
		sendJson(client.socket, { type: 'presence', participants });
	}
}

async function loadRoom(noteId, loaded) {
	const existing = rooms.get(noteId);
	if (existing) return existing;
	const loading = roomLoads.get(noteId);
	if (loading) return loading;

	const pending = Promise.resolve().then(() => {
		const doc = new Y.Doc();
		Y.applyUpdate(doc, loaded.state);
		const room = { noteId, groupId: loaded.groupId, doc, clients: new Set(), updateQueue: Promise.resolve() };
		rooms.set(noteId, room);
		return room;
	});
	roomLoads.set(noteId, pending);
	try {
		return await pending;
	} finally {
		roomLoads.delete(noteId);
	}
}

function removeClient(client) {
	if (!client.room) return;
	client.room.clients.delete(client);
	connections.delete(client);
	broadcastPresence(client.room);
	const room = client.room;
	if (room.clients.size === 0) {
		room.updateQueue.finally(() => {
			if (room.clients.size !== 0 || rooms.get(room.noteId) !== room) return;
			rooms.delete(room.noteId);
			room.doc.destroy();
		});
	}
	client.room = null;
}

async function authenticate(socket, message) {
	if (typeof message.token !== 'string' || typeof message.noteId !== 'string') {
		socket.close(4401, 'Authentication required');
		return;
	}
	const email = getSessionUser(message.token);
	if (!email) {
		socket.close(4401, 'Session expired');
		return;
	}
	let loaded;
	try {
		loaded = await loadCollaborativeNote(email, message.noteId);
	} catch (error) {
		if (error.status === 403 || error.status === 404) {
			socket.close(4403, 'Note access denied');
		} else {
			console.error('Collaborative note could not be loaded.');
			socket.close(1011, 'Unable to load note');
		}
		return;
	}
	const room = await loadRoom(message.noteId, loaded);
	if (socket.readyState !== WebSocket.OPEN) return;
	const client = { socket, email, noteId: message.noteId, groupId: loaded.groupId, room, canEdit: loaded.canEdit };
	socket.client = client;
	client.room.clients.add(client);
	connections.add(client);
	socket.send(Buffer.from(Y.encodeStateAsUpdate(room.doc)), { binary: true });
	sendJson(socket, {
		type: 'ready',
		role: loaded.role,
		participants: [...room.clients].map((participant) => participant.email),
	});
	broadcastPresence(room);
}

async function handleUpdate(client, data) {
	if (data.length > MAX_UPDATE_SIZE) {
		client.socket.close(4400, 'Update is too large');
		return;
	}
	const room = client.room;
	const update = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	const operation = room.updateQueue.then(async () => {
		const previousState = Y.encodeStateAsUpdate(room.doc);
		try {
			Y.applyUpdate(room.doc, update);
			const state = Y.encodeStateAsUpdate(room.doc);
			const result = await saveCollaborativeUpdate(
				client.email,
				client.noteId,
				update,
				state,
				room.doc.getText('title').toString(),
				room.doc.getText('body').toString(),
			);
			for (const peer of room.clients) {
				if (peer !== client && peer.socket.readyState === WebSocket.OPEN) {
					peer.socket.send(Buffer.from(update), { binary: true });
				}
			}
			sendJson(client.socket, { type: 'saved' });
			return result;
		} catch (error) {
			const replacement = new Y.Doc();
			Y.applyUpdate(replacement, previousState);
			room.doc.destroy();
			room.doc = replacement;
			if (error.status === 403 || error.status === 404) {
				client.socket.close(4403, 'Note access revoked');
			} else {
				sendJson(client.socket, { type: 'error', message: 'Не удалось сохранить заметку.' });
				console.error('Collaborative update could not be saved.');
			}
		}
	});
	room.updateQueue = operation.catch(() => {});
	await operation;
}

export function attachCollaboration(httpServer) {
	const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: MAX_UPDATE_SIZE });
	httpServer.on('upgrade', (request, socket, head) => {
		const url = new URL(request.url, 'http://localhost');
		if (url.pathname !== '/collab') {
			socket.destroy();
			return;
		}
		const origin = request.headers.origin;
		const allowedOrigin = process.env.CORS_ORIGIN || 'http://localhost:4174';
		if (origin && origin !== allowedOrigin) {
			socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
			socket.destroy();
			return;
		}
		webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
			webSocketServer.emit('connection', webSocket);
		});
	});

	webSocketServer.on('connection', (socket) => {
		socket.client = null;
		socket.on('message', (data, isBinary) => {
			if (!socket.client) {
				if (isBinary) {
					socket.close(4401, 'Authentication required');
					return;
				}
				let message;
				try {
					message = JSON.parse(data.toString());
				} catch {
					socket.close(4400, 'Invalid authentication message');
					return;
				}
				if (message.type !== 'auth') {
					socket.close(4401, 'Authentication required');
					return;
				}
				authenticate(socket, message).catch(() => {
					console.error('WebSocket authentication failed unexpectedly.');
					socket.close(1011, 'Unable to authenticate');
				});
				return;
			}

			if (isBinary) {
				handleUpdate(socket.client, data).catch(() => {
					sendJson(socket, { type: 'error', message: 'Не удалось сохранить заметку.' });
				});
				return;
			}

			let message;
			try {
				message = JSON.parse(data.toString());
			} catch {
				socket.close(4400, 'Invalid message');
				return;
			}
			if (message.type === 'presence') broadcastPresence(socket.client.room);
		});
		socket.on('close', () => removeClient(socket.client || {}));
		socket.on('error', () => removeClient(socket.client || {}));
	});

	return webSocketServer;
}

function closeConnections(predicate, reason) {
	for (const client of connections) {
		if (!predicate(client)) continue;
		client.socket.close(4403, reason);
	}
}

export function closeGroup(groupId) {
	closeConnections((client) => client.groupId === groupId, 'Group deleted');
}

export function closeGroupMember(groupId, email) {
	closeConnections((client) => client.groupId === groupId && client.email === email, 'Group access revoked');
}

export function closeGroupNote(noteId) {
	closeConnections((client) => client.noteId === noteId, 'Note deleted');
}

export function closePersonalNoteAccess(noteId, email) {
	closeConnections((client) => client.noteId === noteId && client.email === email, 'Note access revoked');
}

export function closeUserConnections(email) {
	closeConnections((client) => client.email === email, 'Session ended');
}
