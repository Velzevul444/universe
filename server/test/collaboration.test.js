import 'dotenv/config';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import express from 'express';
import pg from 'pg';
import WebSocket from 'ws';
import * as Y from 'yjs';
import {
	closeDatabase,
	cancelGroupInvitation,
	createGroup,
	createGroupNote,
	deleteGroup,
	getGroup,
	getGroupNoteAccess,
	getUserProfile,
	initializeDatabase,
	inviteToGroup,
	listFriendRequests,
	listFriends,
	listGroupNotes,
	listPersonalNoteShares,
	listSharedPersonalNotes,
	loadCollaborativeNote,
	register,
	revokePersonalNoteShare,
	removeGroupMember,
	removeFriend,
	respondToFriendRequest,
	respondToGroupInvitation,
	saveCollaborativeUpdate,
	saveUniverse,
	sendFriendRequest,
	sharePersonalNote,
	updateGroupMemberRole,
	updateSharedPersonalNote,
} from '../user.service.js';
import { attachCollaboration } from '../collaboration.js';
import routers from '../user.controller.js';

const testTimeout = 30_000;

async function connectToNote(url, token, noteId) {
	const socket = new WebSocket(url);
	const doc = new Y.Doc();
	let ready = false;
	const serverOrigin = Symbol('server');
	doc.on('update', (update, origin) => {
		if (origin !== serverOrigin && ready && socket.readyState === WebSocket.OPEN) {
			socket.send(update);
		}
	});

	const readyPromise = new Promise((resolve, reject) => {
		socket.on('open', () => socket.send(JSON.stringify({ type: 'auth', token, noteId })));
		socket.on('message', (data, isBinary) => {
			if (isBinary) {
				Y.applyUpdate(doc, data, serverOrigin);
				return;
			}
			const message = JSON.parse(data.toString());
			if (message.type === 'ready') {
				ready = true;
				resolve({ socket, doc, role: message.role });
			} else if (message.type === 'error') {
				reject(new Error(message.message));
			}
		});
		socket.once('error', reject);
		socket.once('close', (code) => {
			if (!ready) reject(new Error(`WebSocket closed before auth (${code}).`));
		});
	});
	return readyPromise;
}

function waitFor(predicate, timeout = 5000) {
	const started = Date.now();
	return new Promise((resolve, reject) => {
		const check = async () => {
			try {
				if (await predicate()) resolve();
				else if (Date.now() - started > timeout) {
					reject(new Error('Timed out waiting for collaboration state.'));
				} else setTimeout(check, 25);
			} catch (error) {
				reject(error);
			}
		};
		check();
	});
}

async function apiRequest(baseUrl, token, path, method = 'GET', body) {
	const response = await fetch(`${baseUrl}/registretion${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			...(body ? { 'Content-Type': 'application/json' } : {}),
		},
		...(body ? { body: JSON.stringify(body) } : {}),
	});
	return {
		response,
		data: response.status === 204 ? {} : await response.json(),
	};
}

test('groups, friends, roles, and Yjs updates work with PostgreSQL', { timeout: testTimeout }, async () => {
	await initializeDatabase();
	const suffix = randomUUID();
	const emails = ['owner', 'editor', 'reader', 'outsider', 'stranger']
		.map((role) => `${role}-${suffix}@example.test`);
	const accounts = [];
	const sockets = [];
	let server;
	let webSocketServer;
	let groupId;

	const cleanup = async () => {
		for (const { socket, doc } of sockets) {
			if (socket.readyState < WebSocket.CLOSING) socket.close();
			doc.destroy();
		}
		if (webSocketServer) {
			for (const socket of webSocketServer.clients) socket.terminate();
			await new Promise((resolve) => webSocketServer.close(resolve));
		}
		if (server?.listening) await new Promise((resolve) => server.close(resolve));
		if (accounts.length) {
			const client = new pg.Client({
				host: process.env.PGHOST || '127.0.0.1',
				port: Number(process.env.PGPORT || 5432),
				database: process.env.PGDATABASE || 'universe_collab',
				user: process.env.PGUSER,
				password: process.env.PGPASSWORD,
			});
			await client.connect();
			await client.query('DELETE FROM users WHERE email = ANY($1::text[])', [emails]);
			await client.end();
		}
		await closeDatabase();
	};

	try {
		for (const email of emails) {
			accounts.push(await register(email, 'test-password-123'));
		}

		const group = await createGroup(emails[0], 'Integration group');
		groupId = group.id;
		await assert.rejects(inviteToGroup(emails[0], groupId, emails[0]), { status: 400 });

		const editorInvite = await inviteToGroup(emails[0], groupId, emails[1]);
		await assert.rejects(inviteToGroup(emails[0], groupId, emails[1]), { status: 409 });
		await respondToGroupInvitation(emails[1], editorInvite.id, true);
		const readerInvite = await inviteToGroup(emails[0], groupId, emails[2], 'reader');
		await respondToGroupInvitation(emails[2], readerInvite.id, true);
		const cancelledInvite = await inviteToGroup(emails[0], groupId, emails[3]);
		await cancelGroupInvitation(emails[0], groupId, cancelledInvite.id);
		await assert.rejects(respondToGroupInvitation(emails[3], cancelledInvite.id, true), { status: 404 });
		const expiredInvite = await inviteToGroup(emails[0], groupId, emails[3]);
		const db = new pg.Client({
			host: process.env.PGHOST || '127.0.0.1',
			port: Number(process.env.PGPORT || 5432),
			database: process.env.PGDATABASE || 'universe_collab',
			user: process.env.PGUSER,
			password: process.env.PGPASSWORD,
		});
		await db.connect();
		await db.query(
			"UPDATE note_group_invitations SET expires_at = NOW() - INTERVAL '1 second' WHERE id = $1",
			[expiredInvite.id],
		);
		await db.end();
		await assert.rejects(respondToGroupInvitation(emails[3], expiredInvite.id, true), { status: 410 });
		const replacementInvite = await inviteToGroup(emails[0], groupId, emails[3]);
		await respondToGroupInvitation(emails[3], replacementInvite.id, true);

		const note = await createGroupNote(emails[1], groupId, {
			NameCore: 'Shared note',
			BioCore: 'start',
			ChoiceCore: true,
			ColorCore: '#8c9eff',
		});
		assert.equal((await listGroupNotes(emails[0], groupId))[0].id, note.id);
		assert.equal((await listGroupNotes(emails[2], groupId))[0].authorEmail, emails[1]);
		await assert.rejects(createGroupNote(emails[2], groupId, {
			NameCore: 'Reader cannot add',
			BioCore: '',
			ChoiceCore: true,
		}), { status: 403 });

		const friendRequest = await sendFriendRequest(emails[1], emails[0]);
		assert.equal((await listFriendRequests(emails[0]))[0].requesterEmail, emails[1]);
		await respondToFriendRequest(emails[0], friendRequest.id, true);
		assert.deepEqual(await listFriends(emails[1]), [emails[0]]);
		await assert.rejects(sendFriendRequest(emails[1], emails[1]), { status: 400 });
		await assert.rejects(sendFriendRequest(emails[1], emails[0]), { status: 409 });
		await removeFriend(emails[0], emails[1]);
		assert.deepEqual(await listFriends(emails[1]), []);

		const app = express();
		app.use(express.json());
		app.use('/registretion', routers);
		app.use((error, request, response, next) => {
			response.status(error.status || 500).json({ error: error.message });
		});
		server = createServer(app);
		webSocketServer = attachCollaboration(server);
		const listening = once(server, 'listening');
		server.listen(0, '127.0.0.1');
		await listening;
		const url = `ws://127.0.0.1:${server.address().port}/collab`;
		const editorA = await connectToNote(url, accounts[0].token, note.id);
		const editorB = await connectToNote(url, accounts[1].token, note.id);
		sockets.push(editorA, editorB);
		assert.equal(editorA.role, 'owner');
		assert.equal(editorB.role, 'editor');

		editorA.doc.getText('body').insert(editorA.doc.getText('body').length, ' from A');
		editorB.doc.getText('body').insert(editorB.doc.getText('body').length, ' from B');
		await waitFor(() => {
			const first = editorA.doc.getText('body').toString();
			const second = editorB.doc.getText('body').toString();
			return first.includes('from A') && first.includes('from B')
				&& second.includes('from A') && second.includes('from B');
		});
		await waitFor(async () => {
			const [savedNote] = await listGroupNotes(emails[0], groupId);
			return savedNote.BioCore.includes('from A') && savedNote.BioCore.includes('from B');
		});
		const closeA = once(editorA.socket, 'close');
		const closeB = once(editorB.socket, 'close');
		editorA.socket.close();
		editorB.socket.close();
		await Promise.all([closeA, closeB]);
		await new Promise((resolve) => setTimeout(resolve, 50));
		const restoredEditor = await connectToNote(url, accounts[0].token, note.id);
		sockets.push(restoredEditor);
		assert.match(restoredEditor.doc.getText('body').toString(), /from A/);
		assert.match(restoredEditor.doc.getText('body').toString(), /from B/);

		const readerSocket = await connectToNote(url, accounts[2].token, note.id);
		sockets.push(readerSocket);
		assert.equal(readerSocket.role, 'reader');
		const closePromise = once(readerSocket.socket, 'close');
		readerSocket.doc.getText('body').insert(readerSocket.doc.getText('body').length, ' denied');
		const [closeCode] = await closePromise;
		assert.equal(closeCode, 4403);
		await assert.rejects(
			saveCollaborativeUpdate(
				emails[2],
				note.id,
				new Uint8Array([0]),
				new Uint8Array([0]),
				'Shared note',
				'forbidden',
			),
			{ status: 403 },
		);
		await assert.rejects(getGroupNoteAccess(emails[4], note.id), { status: 404 });

		const personalNoteId = randomUUID();
		await saveUniverse(emails[0], [{
			id: personalNoteId,
			NameCore: 'Personal shared note',
			BioCore: 'private start',
			ChoiceCore: true,
		}]);
		const apiUrl = `http://127.0.0.1:${server.address().port}`;
		const shareResult = await apiRequest(
			apiUrl,
			accounts[0].token,
			`/notes/${personalNoteId}/shares`,
			'POST',
			{ email: emails[1], role: 'editor' },
		);
		assert.equal(shareResult.response.status, 201);
		await sharePersonalNote(emails[0], personalNoteId, emails[2], 'reader');
		const sharedListResult = await apiRequest(apiUrl, accounts[1].token, '/shared-notes');
		assert.equal(sharedListResult.data.notes[0].id, personalNoteId);
		const sharesResult = await apiRequest(apiUrl, accounts[0].token, `/notes/${personalNoteId}/shares`);
		assert.equal(sharesResult.data.shares.length, 2);
		assert.equal((await listPersonalNoteShares(emails[0], personalNoteId)).length, 2);
		assert.equal((await listSharedPersonalNotes(emails[1]))[0].ownerEmail, emails[0]);
		await assert.rejects(
			sharePersonalNote(emails[0], personalNoteId, emails[4], 'owner'),
			{ status: 400 },
		);
		await assert.rejects(
			sharePersonalNote(emails[4], personalNoteId, emails[1]),
			{ status: 404 },
		);

		const personalEditor = await connectToNote(url, accounts[1].token, personalNoteId);
		sockets.push(personalEditor);
		assert.equal(personalEditor.role, 'editor');
		assert.equal(personalEditor.doc.getText('body').toString(), 'private start');
		personalEditor.doc.getText('body').insert(
			personalEditor.doc.getText('body').length,
			' edited together',
		);
		await waitFor(async () => {
			const profile = await getUserProfile(emails[0]);
			return profile.universe.find((item) => item.id === personalNoteId)?.BioCore
				=== 'private start edited together';
		});
		await updateSharedPersonalNote(emails[1], emails[0], personalNoteId, {
			NameCore: 'stale title',
			BioCore: 'stale body',
			ChoiceCore: true,
			ColorCore: '#8c9eff',
		});
		assert.equal(
			(await getUserProfile(emails[0])).universe.find((item) => item.id === personalNoteId).BioCore,
			'private start edited together',
		);
		const metadataResult = await apiRequest(
			apiUrl,
			accounts[1].token,
			`/shared-notes/${encodeURIComponent(emails[0])}/${personalNoteId}`,
			'PUT',
			{
				note: {
					NameCore: 'stale title',
					BioCore: 'stale body',
					ChoiceCore: true,
					ColorCore: '#ff00aa',
				},
			},
		);
		assert.equal(metadataResult.response.status, 200);
		assert.equal(metadataResult.data.note.BioCore, 'private start edited together');

		const personalReader = await connectToNote(url, accounts[2].token, personalNoteId);
		sockets.push(personalReader);
		assert.equal(personalReader.role, 'reader');
		const readerClosePromise = once(personalReader.socket, 'close');
		personalReader.doc.getText('body').insert(
			personalReader.doc.getText('body').length,
			' forbidden',
		);
		assert.equal((await readerClosePromise)[0], 4403);
		await assert.rejects(
			updateSharedPersonalNote(emails[2], emails[0], personalNoteId, {
				ChoiceCore: true,
				ColorCore: '',
			}),
			{ status: 403 },
		);
		const readerUpdateResult = await apiRequest(
			apiUrl,
			accounts[2].token,
			`/shared-notes/${encodeURIComponent(emails[0])}/${personalNoteId}`,
			'PUT',
			{ note: { NameCore: 'note', BioCore: '', ChoiceCore: true, ColorCore: '' } },
		);
		assert.equal(readerUpdateResult.response.status, 403);

		const revokeClosePromise = once(personalEditor.socket, 'close');
		const revokeResult = await apiRequest(
			apiUrl,
			accounts[0].token,
			`/notes/${personalNoteId}/shares/${encodeURIComponent(emails[1])}`,
			'DELETE',
		);
		assert.equal(revokeResult.response.status, 200);
		assert.equal((await revokeClosePromise)[0], 4403);
		assert.deepEqual(await listSharedPersonalNotes(emails[1]), []);
		await assert.rejects(loadCollaborativeNote(emails[1], personalNoteId), { status: 404 });
		await revokePersonalNoteShare(emails[0], personalNoteId, emails[2]);
		await saveUniverse(emails[0], []);
		await assert.rejects(loadCollaborativeNote(emails[0], personalNoteId), { status: 404 });
		await assert.rejects(listPersonalNoteShares(emails[0], personalNoteId), { status: 404 });

		await updateGroupMemberRole(emails[0], groupId, emails[1], 'reader');
		assert.equal((await getGroup(emails[1], groupId)).role, 'reader');
		await assert.rejects(deleteGroup(emails[1], groupId), { status: 403 });
		await removeGroupMember(emails[3], groupId, emails[3]);
		assert.equal((await listGroupNotes(emails[0], groupId)).length, 1);
		await deleteGroup(emails[0], groupId);
		groupId = null;
		await assert.rejects(loadCollaborativeNote(emails[0], note.id), { status: 404 });
	} finally {
		await cleanup();
	}
});
