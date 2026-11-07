import { Router } from 'express';
import {
	deleteSession,
	createGroup,
	createGroupNote,
	cancelGroupInvitation,
	deleteGroup,
	deleteUser,
	deleteGroupNote,
	getSessionUser,
	getGroup,
	getUserProfile,
	inviteToGroup,
	isAdmin,
	listGroupInvitations,
	listGroupNotes,
	listGroups,
	listFriendRequests,
	listFriends,
	listPersonalNoteShares,
	listSharedPersonalNotes,
	listUsers,
	login,
	register,
	respondToGroupInvitation,
	respondToFriendRequest,
	removeFriend,
	removeGroupMember,
	saveUniverse,
	sendFriendRequest,
	sharePersonalNote,
	updateGroupMemberRole,
	updateGroupNote,
	revokePersonalNoteShare,
	updateSharedPersonalNote,
} from './user.service.js';
import {
	closeGroup,
	closeGroupMember,
	closeGroupNote,
	closeUserConnections,
	closePersonalNoteAccess,
} from './collaboration.js';

const routers = Router();

function normalizeEmail(value) {
	return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validateCredentials(email, password, res) {
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		res.status(400).json({ error: 'Введите корректный email.' });
		return false;
	}
	if (typeof password !== 'string' || password.length < 8) {
		res.status(400).json({ error: 'Пароль должен содержать не менее 8 символов.' });
		return false;
	}
	return true;
}

function validateGroupName(name, res) {
	if (typeof name !== 'string' || !name.trim() || name.trim().length > 60) {
		res.status(400).json({ error: 'Укажите название группы длиной до 60 символов.' });
		return false;
	}
	return true;
}

function validateGroupNote(note, res) {
	if (!note || typeof note !== 'object' || Array.isArray(note)
		|| typeof note.NameCore !== 'string'
		|| typeof note.BioCore !== 'string'
		|| typeof note.ChoiceCore !== 'boolean'
		|| (!note.NameCore.trim() && !note.BioCore.trim())
		|| note.NameCore.length > 200
		|| note.BioCore.length > 50000) {
		res.status(400).json({ error: 'Заметка должна содержать название или текст; максимальная длина — 50 000 символов.' });
		return null;
	}

	const content = {
		NameCore: note.NameCore,
		BioCore: note.BioCore,
		ChoiceCore: note.ChoiceCore,
		ColorCore: typeof note.ColorCore === 'string' && /^#[\da-f]{6}$/i.test(note.ColorCore)
			? note.ColorCore
			: '',
	};
	if (typeof note.parentCoreId === 'string') content.parentCoreId = note.parentCoreId;
	if (Array.isArray(note.links)) {
		content.links = note.links.filter((id) => typeof id === 'string').slice(0, 200);
	}
	if (note.position && typeof note.position === 'object'
		&& Number.isFinite(note.position.x) && Number.isFinite(note.position.y)) {
		content.position = {
			x: Math.max(0, Math.min(1000, note.position.x)),
			y: Math.max(0, Math.min(1000, note.position.y)),
		};
		content.positionCustom = note.positionCustom === true;
	}
	if (Number.isFinite(note.rotation)) content.rotation = note.rotation;
	return content;
}

function requireSession(req, res, next) {
	const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
	const email = getSessionUser(token);
	if (!email) {
		res.status(401).json({ error: 'Войдите в аккаунт, чтобы продолжить.' });
		return;
	}
	req.email = email;
	req.token = token;
	next();
}

async function requireAdmin(req, res, next) {
	try {
		if (!await isAdmin(req.email)) {
			res.status(403).json({ error: 'Доступ только для администратора.' });
			return;
		}
		next();
	} catch (error) {
		next(error);
	}
}

routers.post('/register', async (req, res, next) => {
	const email = normalizeEmail(req.body?.email);
	const { password } = req.body ?? {};
	if (!validateCredentials(email, password, res)) return;

	try {
		res.status(201).json(await register(email, password));
	} catch (error) {
		next(error);
	}
});

routers.post('/login', async (req, res, next) => {
	const email = normalizeEmail(req.body?.email);
	const { password } = req.body ?? {};
	if (typeof password !== 'string' || !email) {
		res.status(400).json({ error: 'Укажите email и пароль.' });
		return;
	}

	try {
		res.json(await login(email, password));
	} catch (error) {
		next(error);
	}
});

routers.get('/me', requireSession, async (req, res, next) => {
	try {
		res.json(await getUserProfile(req.email));
	} catch (error) {
		next(error);
	}
});

routers.get('/admin/users', requireSession, requireAdmin, async (req, res, next) => {
	try {
		res.json({ users: await listUsers() });
	} catch (error) {
		next(error);
	}
});

routers.delete('/admin/users/:email', requireSession, requireAdmin, async (req, res, next) => {
	const targetEmail = normalizeEmail(req.params.email);
	if (!targetEmail) {
		res.status(400).json({ error: 'Укажите email пользователя.' });
		return;
	}

	try {
		const result = await deleteUser(req.email, targetEmail);
		closeUserConnections(targetEmail);
		for (const groupId of result.deletedGroupIds) closeGroup(groupId);
		for (const noteId of result.deletedNoteIds) closeGroupNote(noteId);
		res.json({ email: result.email });
	} catch (error) {
		next(error);
	}
});

routers.put('/universe', requireSession, async (req, res, next) => {
	if (!Array.isArray(req.body?.universe)) {
		res.status(400).json({ error: 'Поле universe должно быть массивом.' });
		return;
	}

	try {
		const result = await saveUniverse(req.email, req.body.universe);
		for (const noteId of result.deletedNoteIds) closeGroupNote(noteId);
		res.json({ universe: result.universe });
	} catch (error) {
		next(error);
	}
});

routers.get('/shared-notes', requireSession, async (req, res, next) => {
	try {
		res.json({ notes: await listSharedPersonalNotes(req.email) });
	} catch (error) {
		next(error);
	}
});

routers.put('/shared-notes/:ownerEmail/:noteId', requireSession, async (req, res, next) => {
	const ownerEmail = normalizeEmail(req.params.ownerEmail);
	const content = validateGroupNote(req.body?.note, res);
	if (!content) return;
	try {
		res.json({
			note: await updateSharedPersonalNote(req.email, ownerEmail, req.params.noteId, content),
		});
	} catch (error) {
		next(error);
	}
});

routers.get('/notes/:noteId/shares', requireSession, async (req, res, next) => {
	try {
		res.json({ shares: await listPersonalNoteShares(req.email, req.params.noteId) });
	} catch (error) {
		next(error);
	}
});

routers.post('/notes/:noteId/shares', requireSession, async (req, res, next) => {
	const email = normalizeEmail(req.body?.email);
	const role = req.body?.role === undefined ? 'reader' : req.body.role;
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		res.status(400).json({ error: 'Введите корректный email.' });
		return;
	}
	try {
		const share = await sharePersonalNote(req.email, req.params.noteId, email, role);
		if (share.role === 'reader') closePersonalNoteAccess(req.params.noteId, email);
		res.status(201).json({
			share,
		});
	} catch (error) {
		next(error);
	}
});

routers.delete('/notes/:noteId/shares/:email', requireSession, async (req, res, next) => {
	const email = normalizeEmail(req.params.email);
	try {
		const result = await revokePersonalNoteShare(req.email, req.params.noteId, email);
		closePersonalNoteAccess(req.params.noteId, email);
		res.json(result);
	} catch (error) {
		next(error);
	}
});

routers.get('/groups', requireSession, async (req, res, next) => {
	try {
		res.json({ groups: await listGroups(req.email) });
	} catch (error) {
		next(error);
	}
});

routers.post('/groups', requireSession, async (req, res, next) => {
	const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
	if (!validateGroupName(name, res)) return;
	try {
		res.status(201).json({ group: await createGroup(req.email, name) });
	} catch (error) {
		next(error);
	}
});

routers.get('/group-invitations', requireSession, async (req, res, next) => {
	try {
		res.json({ invitations: await listGroupInvitations(req.email) });
	} catch (error) {
		next(error);
	}
});

routers.post('/group-invitations/:id/:response', requireSession, async (req, res, next) => {
	const accept = req.params.response === 'accept';
	if (!accept && req.params.response !== 'decline') {
		res.status(404).json({ error: 'Действие с приглашением не найдено.' });
		return;
	}
	try {
		res.json(await respondToGroupInvitation(req.email, req.params.id, accept));
	} catch (error) {
		next(error);
	}
});

routers.get('/groups/:groupId', requireSession, async (req, res, next) => {
	try {
		res.json({ group: await getGroup(req.email, req.params.groupId) });
	} catch (error) {
		next(error);
	}
});

routers.post('/groups/:groupId/invitations', requireSession, async (req, res, next) => {
	const email = normalizeEmail(req.body?.email);
	const role = req.body?.role === undefined ? 'editor' : req.body.role;
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		res.status(400).json({ error: 'Введите корректный email.' });
		return;
	}
	try {
		res.status(201).json(await inviteToGroup(req.email, req.params.groupId, email, role));
	} catch (error) {
		next(error);
	}
});

routers.delete('/groups/:groupId/invitations/:invitationId', requireSession, async (req, res, next) => {
	try {
		res.json(await cancelGroupInvitation(
			req.email,
			req.params.groupId,
			req.params.invitationId,
		));
	} catch (error) {
		next(error);
	}
});

routers.patch('/groups/:groupId/members/:email', requireSession, async (req, res, next) => {
	const memberEmail = normalizeEmail(req.params.email);
	try {
		const result = await updateGroupMemberRole(
			req.email,
			req.params.groupId,
			memberEmail,
			req.body?.role,
		);
		if (result.role === 'reader') closeGroupMember(req.params.groupId, memberEmail);
		res.json(result);
	} catch (error) {
		next(error);
	}
});

routers.delete('/groups/:groupId/members/:email', requireSession, async (req, res, next) => {
	const memberEmail = normalizeEmail(req.params.email);
	try {
		const result = await removeGroupMember(req.email, req.params.groupId, memberEmail);
		closeGroupMember(req.params.groupId, memberEmail);
		res.json(result);
	} catch (error) {
		next(error);
	}
});

routers.delete('/groups/:groupId', requireSession, async (req, res, next) => {
	try {
		const result = await deleteGroup(req.email, req.params.groupId);
		closeGroup(req.params.groupId);
		res.json(result);
	} catch (error) {
		next(error);
	}
});

routers.get('/groups/:groupId/notes', requireSession, async (req, res, next) => {
	try {
		res.json({ notes: await listGroupNotes(req.email, req.params.groupId) });
	} catch (error) {
		next(error);
	}
});

routers.post('/groups/:groupId/notes', requireSession, async (req, res, next) => {
	const content = validateGroupNote(req.body?.note, res);
	if (!content) return;
	try {
		res.status(201).json({
			note: await createGroupNote(req.email, req.params.groupId, content),
		});
	} catch (error) {
		next(error);
	}
});

routers.put('/groups/:groupId/notes/:noteId', requireSession, async (req, res, next) => {
	const content = validateGroupNote(req.body?.note, res);
	if (!content) return;
	try {
		res.json({
			note: await updateGroupNote(
				req.email,
				req.params.groupId,
				req.params.noteId,
				content,
			),
		});
	} catch (error) {
		next(error);
	}
});

routers.delete('/groups/:groupId/notes/:noteId', requireSession, async (req, res, next) => {
	try {
		const result = await deleteGroupNote(req.email, req.params.groupId, req.params.noteId);
		closeGroupNote(req.params.noteId);
		res.json(result);
	} catch (error) {
		next(error);
	}
});

routers.get('/friends', requireSession, async (req, res, next) => {
	try {
		res.json({ friends: await listFriends(req.email) });
	} catch (error) {
		next(error);
	}
});

routers.get('/friend-requests', requireSession, async (req, res, next) => {
	try {
		res.json({ requests: await listFriendRequests(req.email) });
	} catch (error) {
		next(error);
	}
});

routers.post('/friend-requests', requireSession, async (req, res, next) => {
	const targetEmail = normalizeEmail(req.body?.email);
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
		res.status(400).json({ error: 'Введите корректный email.' });
		return;
	}
	try {
		res.status(201).json(await sendFriendRequest(req.email, targetEmail));
	} catch (error) {
		next(error);
	}
});

routers.post('/friend-requests/:id/:response', requireSession, async (req, res, next) => {
	const accept = req.params.response === 'accept';
	if (!accept && req.params.response !== 'decline') {
		res.status(404).json({ error: 'Действие с запросом в друзья не найдено.' });
		return;
	}
	try {
		res.json(await respondToFriendRequest(req.email, req.params.id, accept));
	} catch (error) {
		next(error);
	}
});

routers.delete('/friends/:email', requireSession, async (req, res, next) => {
	const friendEmail = normalizeEmail(req.params.email);
	try {
		res.json(await removeFriend(req.email, friendEmail));
	} catch (error) {
		next(error);
	}
});

routers.post('/logout', requireSession, (req, res) => {
	deleteSession(req.token);
	closeUserConnections(req.email);
	res.status(204).end();
});

export default routers;
