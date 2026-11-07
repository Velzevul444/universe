import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { Pool } from 'pg';
import { promisify } from 'node:util';
import * as Y from 'yjs';

const scrypt = promisify(scryptCallback);
const pool = new Pool({
	host: process.env.PGHOST || '127.0.0.1',
	port: Number(process.env.PGPORT || 5432),
	database: process.env.PGDATABASE || 'universe_collab',
	user: process.env.PGUSER,
	password: process.env.PGPASSWORD,
});
const sessions = new Map();

export async function initializeDatabase() {
	if (!process.env.PGUSER || !process.env.PGPASSWORD) {
		throw new Error('Set PGUSER and PGPASSWORD to connect to PostgreSQL.');
	}

	await pool.query(`
		CREATE TABLE IF NOT EXISTS users (
			email TEXT PRIMARY KEY,
			password_salt TEXT NOT NULL,
			password_hash TEXT NOT NULL,
			universe JSONB NOT NULL DEFAULT '[]'::jsonb,
			is_admin BOOLEAN NOT NULL DEFAULT FALSE
		)
	`);
	await pool.query(`
		ALTER TABLE users
		ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE
	`);
	await pool.query(`
		CREATE TABLE IF NOT EXISTS note_groups (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			owner_email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`);
	await pool.query(`
		CREATE TABLE IF NOT EXISTS note_group_members (
			group_id TEXT NOT NULL REFERENCES note_groups(id) ON DELETE CASCADE,
			email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
			role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
			joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			PRIMARY KEY (group_id, email)
		)
	`);
	await pool.query(`
		ALTER TABLE note_group_members
		DROP CONSTRAINT IF EXISTS note_group_members_role_check
	`);
	await pool.query(`
		UPDATE note_group_members SET role = 'editor' WHERE role = 'member'
	`);
	await pool.query(`
		ALTER TABLE note_group_members
		ADD CONSTRAINT note_group_members_role_check
		CHECK (role IN ('owner', 'editor', 'reader'))
	`);
	await pool.query(`
		CREATE TABLE IF NOT EXISTS note_group_invitations (
			id TEXT PRIMARY KEY,
			group_id TEXT NOT NULL REFERENCES note_groups(id) ON DELETE CASCADE,
			inviter_email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
			invitee_email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
			role TEXT NOT NULL DEFAULT 'editor',
			status TEXT NOT NULL DEFAULT 'pending'
				CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
			expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`);
	await pool.query(`
		ALTER TABLE note_group_invitations
		ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'editor'
	`);
	await pool.query(`
		ALTER TABLE note_group_invitations
		DROP CONSTRAINT IF EXISTS note_group_invitations_role_check
	`);
	await pool.query(`
		ALTER TABLE note_group_invitations
		ADD CONSTRAINT note_group_invitations_role_check
		CHECK (role IN ('editor', 'reader'))
	`);
	await pool.query(`
		ALTER TABLE note_group_invitations
		ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
	`);
	await pool.query(`
		ALTER TABLE note_group_invitations
		DROP CONSTRAINT IF EXISTS note_group_invitations_status_check
	`);
	await pool.query(`
		ALTER TABLE note_group_invitations
		ADD CONSTRAINT note_group_invitations_status_check
		CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired'))
	`);
	await pool.query(`
		CREATE UNIQUE INDEX IF NOT EXISTS note_group_pending_invitation
		ON note_group_invitations (group_id, invitee_email)
		WHERE status = 'pending'
	`);
	await pool.query(`
		CREATE TABLE IF NOT EXISTS note_group_notes (
			id TEXT PRIMARY KEY,
			group_id TEXT NOT NULL REFERENCES note_groups(id) ON DELETE CASCADE,
			author_email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
			content JSONB NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`);
	await pool.query(`
		CREATE TABLE IF NOT EXISTS personal_note_shares (
			owner_email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
			note_id TEXT NOT NULL,
			shared_with_email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
			role TEXT NOT NULL CHECK (role IN ('editor', 'reader')),
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			PRIMARY KEY (owner_email, note_id, shared_with_email),
			CHECK (owner_email <> shared_with_email)
		)
	`);
	await pool.query(`
		CREATE INDEX IF NOT EXISTS personal_note_shares_recipient
		ON personal_note_shares (shared_with_email, created_at)
	`);
	await pool.query(`
		CREATE TABLE IF NOT EXISTS yjs_documents (
			note_id TEXT PRIMARY KEY,
			state BYTEA NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`);
	await pool.query(`
		ALTER TABLE yjs_documents
		DROP CONSTRAINT IF EXISTS yjs_documents_note_id_fkey
	`);
	await pool.query(`
		CREATE TABLE IF NOT EXISTS yjs_updates (
			id BIGSERIAL PRIMARY KEY,
			note_id TEXT NOT NULL,
			update_data BYTEA NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`);
	await pool.query(`
		ALTER TABLE yjs_updates
		DROP CONSTRAINT IF EXISTS yjs_updates_note_id_fkey
	`);
	await pool.query(`
		CREATE INDEX IF NOT EXISTS yjs_updates_note_id_id
		ON yjs_updates (note_id, id DESC)
	`);
	await pool.query(`
		CREATE TABLE IF NOT EXISTS friend_requests (
			id TEXT PRIMARY KEY,
			user_low TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
			user_high TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
			requester_email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
			status TEXT NOT NULL DEFAULT 'pending'
				CHECK (status IN ('pending', 'accepted', 'declined')),
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			CHECK (user_low < user_high),
			CHECK (requester_email IN (user_low, user_high))
		)
	`);
	await pool.query(`
		ALTER TABLE friend_requests
		DROP CONSTRAINT IF EXISTS friend_requests_user_low_user_high_key
	`);
	await pool.query(`
		CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_active_pair
		ON friend_requests (user_low, user_high)
		WHERE status IN ('pending', 'accepted')
	`);
	await pool.query(`
		CREATE TABLE IF NOT EXISTS collaboration_audit_log (
			id BIGSERIAL PRIMARY KEY,
			group_id TEXT NOT NULL REFERENCES note_groups(id) ON DELETE CASCADE,
			actor_email TEXT REFERENCES users(email) ON DELETE SET NULL,
			target_email TEXT REFERENCES users(email) ON DELETE SET NULL,
			action TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`);
}

async function hashPassword(password, salt) {
	return (await scrypt(password, salt, 64)).toString('hex');
}

function createSession(email) {
	const token = randomBytes(32).toString('hex');
	sessions.set(token, email);
	return token;
}

function duplicateAccountError() {
	const error = new Error('Аккаунт с таким email уже существует.');
	error.status = 409;
	return error;
}

export async function register(email, password) {
	const salt = randomBytes(16).toString('hex');
	const passwordHash = await hashPassword(password, salt);

	try {
		const { rows } = await pool.query(
			`INSERT INTO users (email, password_salt, password_hash)
			 VALUES ($1, $2, $3)
			 RETURNING email, universe, is_admin AS "isAdmin"`,
			[email, salt, passwordHash],
		);
		const user = rows[0];
		return {
			token: createSession(user.email),
			email: user.email,
			universe: user.universe,
			isAdmin: user.isAdmin,
		};
	} catch (error) {
		if (error.code === '23505') throw duplicateAccountError();
		throw error;
	}
}

export async function login(email, password) {
	const { rows } = await pool.query(
		'SELECT email, password_salt, password_hash, universe, is_admin AS "isAdmin" FROM users WHERE email = $1',
		[email],
	);
	const user = rows[0];
	if (!user) {
		const error = new Error('Неверный email или пароль.');
		error.status = 401;
		throw error;
	}

	const actualHash = Buffer.from(await hashPassword(password, user.password_salt), 'hex');
	const expectedHash = Buffer.from(user.password_hash, 'hex');
	if (actualHash.length !== expectedHash.length || !timingSafeEqual(actualHash, expectedHash)) {
		const error = new Error('Неверный email или пароль.');
		error.status = 401;
		throw error;
	}

	return {
		token: createSession(user.email),
		email: user.email,
		universe: user.universe,
		isAdmin: user.isAdmin,
	};
}

export function getSessionUser(token) {
	return token ? sessions.get(token) : undefined;
}

export async function getUserProfile(email) {
	const { rows } = await pool.query(
		'SELECT email, universe, is_admin AS "isAdmin" FROM users WHERE email = $1',
		[email],
	);
	const user = rows[0];
	if (!user) {
		const error = new Error('Пользователь не найден.');
		error.status = 404;
		throw error;
	}
	return user;
}

export async function isAdmin(email) {
	const { rows } = await pool.query(
		'SELECT is_admin FROM users WHERE email = $1',
		[email],
	);
	return rows[0]?.is_admin === true;
}

export async function listUsers() {
	const { rows } = await pool.query(`
		SELECT
			email,
			is_admin AS "isAdmin",
			jsonb_array_length(universe) AS "noteCount"
		FROM users
		ORDER BY email
	`);
	return rows;
}

function createAdminError(message, status) {
	const error = new Error(message);
	error.status = status;
	return error;
}

export async function deleteUser(adminEmail, targetEmail) {
	if (adminEmail === targetEmail) {
		throw createAdminError('Нельзя удалить собственный аккаунт администратора.', 400);
	}

	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		await client.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE');

		const { rows: adminRows } = await client.query(
			'SELECT is_admin FROM users WHERE email = $1',
			[adminEmail],
		);
		if (adminRows[0]?.is_admin !== true) {
			throw createAdminError('Недостаточно прав для удаления пользователей.', 403);
		}

		const { rows: targetRows } = await client.query(
			'SELECT is_admin, universe FROM users WHERE email = $1',
			[targetEmail],
		);
		if (!targetRows[0]) {
			throw createAdminError('Пользователь не найден.', 404);
		}

		if (targetRows[0].is_admin) {
			const { rows: countRows } = await client.query(
				'SELECT COUNT(*)::int AS count FROM users WHERE is_admin = TRUE',
			);
			if (countRows[0].count <= 1) {
				throw createAdminError('Нельзя удалить последнего администратора.', 409);
			}
		}

		const { rows: ownedGroups } = await client.query(
			'SELECT id FROM note_groups WHERE owner_email = $1',
			[targetEmail],
		);
		const { rows: groupNotes } = await client.query(
			`SELECT id FROM note_group_notes
			 WHERE author_email = $1 OR group_id = ANY($2::text[])`,
			[targetEmail, ownedGroups.map((group) => group.id)],
		);
		const deletedNoteIds = [
			...new Set([
				...targetRows[0].universe.map((note) => note?.id).filter((id) => typeof id === 'string'),
				...groupNotes.map((note) => note.id),
			]),
		];
		if (deletedNoteIds.length > 0) {
			await client.query('DELETE FROM yjs_updates WHERE note_id = ANY($1::text[])', [deletedNoteIds]);
			await client.query('DELETE FROM yjs_documents WHERE note_id = ANY($1::text[])', [deletedNoteIds]);
		}
		await client.query('DELETE FROM users WHERE email = $1', [targetEmail]);
		await client.query('COMMIT');
		for (const [token, email] of sessions) {
			if (email === targetEmail) sessions.delete(token);
		}
		return {
			email: targetEmail,
			deletedGroupIds: ownedGroups.map((group) => group.id),
			deletedNoteIds,
		};
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
}

export async function saveUniverse(email, universe) {
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const { rows: currentRows } = await client.query(
			'SELECT universe FROM users WHERE email = $1 FOR UPDATE',
			[email],
		);
		if (!currentRows[0]) {
			const error = new Error('Пользователь не найден.');
			error.status = 404;
			throw error;
		}
		const previousIds = new Set(currentRows[0].universe
			.map((note) => note?.id)
			.filter((id) => typeof id === 'string'));
		const nextIds = new Set(universe
			.map((note) => note?.id)
			.filter((id) => typeof id === 'string'));
		const deletedNoteIds = [...previousIds].filter((id) => !nextIds.has(id));
		const { rows } = await client.query(
			'UPDATE users SET universe = $2::jsonb WHERE email = $1 RETURNING universe',
			[email, JSON.stringify(universe)],
		);
		if (deletedNoteIds.length > 0) {
			await client.query(
				'DELETE FROM personal_note_shares WHERE owner_email = $1 AND note_id = ANY($2::text[])',
				[email, deletedNoteIds],
			);
			await client.query(
				'DELETE FROM yjs_updates WHERE note_id = ANY($1::text[])',
				[deletedNoteIds],
			);
			await client.query(
				'DELETE FROM yjs_documents WHERE note_id = ANY($1::text[])',
				[deletedNoteIds],
			);
		}
		await client.query('COMMIT');
		return { universe: rows[0].universe, deletedNoteIds };
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
}

async function getPersonalNote(ownerEmail, noteId) {
	const { rows } = await pool.query(
		`SELECT note.value AS content
		 FROM users u
		 CROSS JOIN LATERAL jsonb_array_elements(u.universe) AS note(value)
		 WHERE u.email = $1 AND note.value->>'id' = $2`,
		[ownerEmail, noteId],
	);
	if (!rows[0]) throw createGroupError('Личная заметка не найдена.', 404);
	return rows[0].content;
}

export async function listPersonalNoteShares(ownerEmail, noteId) {
	await getPersonalNote(ownerEmail, noteId);
	const { rows } = await pool.query(
		`SELECT shared_with_email AS email, role, created_at AS "createdAt"
		 FROM personal_note_shares
		 WHERE owner_email = $1 AND note_id = $2
		 ORDER BY created_at, shared_with_email`,
		[ownerEmail, noteId],
	);
	return rows;
}

export async function sharePersonalNote(ownerEmail, noteId, targetEmail, role = 'reader') {
	if (ownerEmail === targetEmail) {
		throw createGroupError('Нельзя делиться заметкой с самим собой.', 400);
	}
	if (!['editor', 'reader'].includes(role)) {
		throw createGroupError('Роль должна быть editor или reader.', 400);
	}
	await getPersonalNote(ownerEmail, noteId);
	const { rows: users } = await pool.query('SELECT email FROM users WHERE email = $1', [targetEmail]);
	if (!users[0]) throw createGroupError('Пользователь с таким email не найден.', 404);
	const { rows } = await pool.query(
		`INSERT INTO personal_note_shares (owner_email, note_id, shared_with_email, role)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (owner_email, note_id, shared_with_email)
		 DO UPDATE SET role = EXCLUDED.role
		 RETURNING shared_with_email AS email, role`,
		[ownerEmail, noteId, targetEmail, role],
	);
	return rows[0];
}

export async function revokePersonalNoteShare(ownerEmail, noteId, targetEmail) {
	const { rows } = await pool.query(
		`DELETE FROM personal_note_shares
		 WHERE owner_email = $1 AND note_id = $2 AND shared_with_email = $3
		 RETURNING shared_with_email AS email`,
		[ownerEmail, noteId, targetEmail],
	);
	if (!rows[0]) throw createGroupError('Совместный доступ не найден.', 404);
	return rows[0];
}

export async function listSharedPersonalNotes(email) {
	const { rows } = await pool.query(
		`SELECT note.value AS content, owner.email AS "ownerEmail", share.role
		 FROM personal_note_shares share
		 JOIN users owner ON owner.email = share.owner_email
		 CROSS JOIN LATERAL jsonb_array_elements(owner.universe) AS note(value)
		 WHERE share.shared_with_email = $1 AND note.value->>'id' = share.note_id
		 ORDER BY share.created_at, share.note_id`,
		[email],
	);
	return rows.map(({ content, ownerEmail, role }) => ({
		...content,
		id: content.id,
		ownerEmail,
		role,
	}));
}

export async function updateSharedPersonalNote(email, ownerEmail, noteId, content) {
	const metadata = {
		ChoiceCore: content.ChoiceCore,
		ColorCore: content.ColorCore,
	};
	if (typeof content.parentCoreId === 'string') metadata.parentCoreId = content.parentCoreId;
	if (Array.isArray(content.links)) metadata.links = content.links;
	if (content.position && typeof content.position === 'object') {
		metadata.position = content.position;
		metadata.positionCustom = content.positionCustom === true;
	}
	if (Number.isFinite(content.rotation)) metadata.rotation = content.rotation;

	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const { rows: owners } = await client.query(
			'SELECT universe FROM users WHERE email = $1 FOR UPDATE',
			[ownerEmail],
		);
		const note = owners[0]?.universe.find((item) => item.id === noteId);
		if (!note) throw createGroupError('Личная заметка не найдена.', 404);
		if (email !== ownerEmail) {
			const { rows: shares } = await client.query(
				`SELECT role FROM personal_note_shares
				 WHERE owner_email = $1 AND note_id = $2 AND shared_with_email = $3
				 FOR UPDATE`,
				[ownerEmail, noteId, email],
			);
			if (!shares[0]) throw createGroupError('Доступ к заметке отозван.', 403);
			if (shares[0].role !== 'editor') {
				throw createGroupError('Для изменения заметки нужна роль редактора.', 403);
			}
		}

		const noteMetadata = content.ChoiceCore === true
			? { ...metadata, parentCoreId: null }
			: metadata;
		const { rows } = await client.query(
			`UPDATE users owner SET universe = (
				SELECT jsonb_agg(
					CASE WHEN item.value->>'id' = $2 THEN
						CASE WHEN $4::boolean
							THEN (item.value || $3::jsonb) - 'parentCoreId'
							ELSE item.value || $3::jsonb
						END
					ELSE item.value END
					ORDER BY item.ordinality
				)
				FROM jsonb_array_elements(owner.universe) WITH ORDINALITY AS item(value, ordinality)
			)
			WHERE owner.email = $1
			RETURNING universe`,
			[ownerEmail, noteId, JSON.stringify(noteMetadata), content.ChoiceCore === true],
		);
		await client.query('COMMIT');
		return {
			...rows[0].universe.find((item) => item.id === noteId),
			ownerEmail,
			role: email === ownerEmail ? 'owner' : 'editor',
		};
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
}

function createGroupError(message, status) {
	const error = new Error(message);
	error.status = status;
	return error;
}

export async function listGroups(email) {
	const { rows } = await pool.query(`
		SELECT
			g.id,
			g.name,
			g.owner_email AS "ownerEmail",
			mine.role,
			COUNT(DISTINCT m.email)::int AS "memberCount",
			COUNT(DISTINCT n.id)::int AS "noteCount"
		FROM note_groups g
		JOIN note_group_members mine ON mine.group_id = g.id AND mine.email = $1
		JOIN note_group_members m ON m.group_id = g.id
		LEFT JOIN note_group_notes n ON n.group_id = g.id
		GROUP BY g.id, mine.role
		ORDER BY g.created_at
	`, [email]);
	return rows;
}

export async function createGroup(ownerEmail, name) {
	const id = randomUUID();
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		await client.query(
			'INSERT INTO note_groups (id, name, owner_email) VALUES ($1, $2, $3)',
			[id, name, ownerEmail],
		);
		await client.query(
			`INSERT INTO note_group_members (group_id, email, role)
			 VALUES ($1, $2, 'owner')`,
			[id, ownerEmail],
		);
		await client.query('COMMIT');
		return { id, name, ownerEmail, role: 'owner', memberCount: 1, noteCount: 0 };
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
}

async function getGroupMembership(email, groupId) {
	const { rows } = await pool.query(
		`SELECT g.id, g.name, g.owner_email AS "ownerEmail", m.role
		 FROM note_groups g
		 JOIN note_group_members m ON m.group_id = g.id
		 WHERE g.id = $1 AND m.email = $2`,
		[groupId, email],
	);
	if (!rows[0]) throw createGroupError('Группа не найдена или у вас нет доступа.', 404);
	return rows[0];
}

export async function getGroup(email, groupId) {
	const group = await getGroupMembership(email, groupId);
	const { rows } = await pool.query(
		`SELECT email, role FROM note_group_members
		 WHERE group_id = $1 ORDER BY joined_at, email`,
		[groupId],
	);
	const pendingInvitations = group.role === 'owner'
		? (await pool.query(
			`SELECT id, invitee_email AS "inviteeEmail", role, expires_at AS "expiresAt"
			 FROM note_group_invitations
			 WHERE group_id = $1 AND status = 'pending' AND expires_at > NOW()
			 ORDER BY created_at`,
			[groupId],
		)).rows
		: [];
	return { ...group, members: rows, pendingInvitations };
}

export async function updateGroupMemberRole(ownerEmail, groupId, memberEmail, role) {
	const group = await getGroupMembership(ownerEmail, groupId);
	if (group.role !== 'owner') {
		throw createGroupError('Только владелец группы может изменять роли.', 403);
	}
	if (!['editor', 'reader'].includes(role)) {
		throw createGroupError('Роль должна быть editor или reader.', 400);
	}
	if (memberEmail === ownerEmail) {
		throw createGroupError('Нельзя изменить роль владельца группы.', 400);
	}
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const { rows } = await client.query(
			`UPDATE note_group_members SET role = $3
			 WHERE group_id = $1 AND email = $2 AND role <> 'owner'
			 RETURNING email`,
			[groupId, memberEmail, role],
		);
		if (!rows[0]) throw createGroupError('Участник группы не найден.', 404);
		await client.query(
			`INSERT INTO collaboration_audit_log (group_id, actor_email, target_email, action)
			 VALUES ($1, $2, $3, $4)`,
			[groupId, ownerEmail, memberEmail, `member_role_${role}`],
		);
		await client.query('COMMIT');
		return { email: memberEmail, role };
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
}

export async function removeGroupMember(actorEmail, groupId, memberEmail) {
	const group = await getGroupMembership(actorEmail, groupId);
	if (memberEmail === group.ownerEmail) {
		throw createGroupError('Владелец не может выйти из группы. Удалите группу или назначьте другого владельца.', 400);
	}
	if (actorEmail !== group.ownerEmail && actorEmail !== memberEmail) {
		throw createGroupError('Удалять участников может только владелец группы.', 403);
	}
	const { rows } = await pool.query(
		`DELETE FROM note_group_members
		 WHERE group_id = $1 AND email = $2 AND role <> 'owner'
		 RETURNING email`,
		[groupId, memberEmail],
	);
	if (!rows[0]) throw createGroupError('Участник группы не найден.', 404);
	await pool.query(
		`INSERT INTO collaboration_audit_log (group_id, actor_email, target_email, action)
		 VALUES ($1, $2, $3, 'member_removed')`,
		[groupId, actorEmail, memberEmail],
	);
	return { email: memberEmail };
}

export async function deleteGroup(ownerEmail, groupId) {
	const group = await getGroupMembership(ownerEmail, groupId);
	if (group.role !== 'owner') {
		throw createGroupError('Удалить группу может только её владелец.', 403);
	}
	const { rows: notes } = await pool.query(
		'SELECT id FROM note_group_notes WHERE group_id = $1',
		[groupId],
	);
	const noteIds = notes.map((note) => note.id);
	if (noteIds.length > 0) {
		await pool.query('DELETE FROM yjs_updates WHERE note_id = ANY($1::text[])', [noteIds]);
		await pool.query('DELETE FROM yjs_documents WHERE note_id = ANY($1::text[])', [noteIds]);
	}
	await pool.query('DELETE FROM note_groups WHERE id = $1', [groupId]);
	return { id: groupId };
}

export async function listGroupInvitations(email) {
	const { rows } = await pool.query(
		`SELECT
			i.id,
			i.group_id AS "groupId",
			g.name AS "groupName",
			i.inviter_email AS "inviterEmail",
			i.created_at AS "createdAt",
			i.expires_at AS "expiresAt"
		 FROM note_group_invitations i
		 JOIN note_groups g ON g.id = i.group_id
		 WHERE i.invitee_email = $1 AND i.status = 'pending' AND i.expires_at > NOW()
		 ORDER BY i.created_at`,
		[email],
	);
	return rows;
}

export async function inviteToGroup(ownerEmail, groupId, inviteeEmail, role = 'editor') {
	const group = await getGroupMembership(ownerEmail, groupId);
	if (group.role !== 'owner') {
		throw createGroupError('Только владелец группы может приглашать участников.', 403);
	}
	if (!['editor', 'reader'].includes(role)) {
		throw createGroupError('Укажите роль editor или reader.', 400);
	}
	if (inviteeEmail === ownerEmail) {
		throw createGroupError('Нельзя пригласить себя в свою группу.', 400);
	}

	const { rows: users } = await pool.query('SELECT email FROM users WHERE email = $1', [inviteeEmail]);
	if (!users[0]) throw createGroupError('Пользователь с таким email не найден.', 404);
	const { rows: members } = await pool.query(
		'SELECT 1 FROM note_group_members WHERE group_id = $1 AND email = $2',
		[groupId, inviteeEmail],
	);
	if (members[0]) throw createGroupError('Этот пользователь уже состоит в группе.', 409);

	await pool.query(
		`UPDATE note_group_invitations SET status = 'expired'
		 WHERE group_id = $1 AND invitee_email = $2
			AND status = 'pending' AND expires_at <= NOW()`,
		[groupId, inviteeEmail],
	);
	const { rows } = await pool.query(
		`INSERT INTO note_group_invitations (id, group_id, inviter_email, invitee_email, role)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (group_id, invitee_email) WHERE status = 'pending' DO NOTHING
		 RETURNING id`,
		[randomUUID(), groupId, ownerEmail, inviteeEmail, role],
	);
	if (!rows[0]) throw createGroupError('Приглашение этому пользователю уже отправлено.', 409);
	await pool.query(
		`INSERT INTO collaboration_audit_log (group_id, actor_email, target_email, action)
		 VALUES ($1, $2, $3, 'member_invited')`,
		[groupId, ownerEmail, inviteeEmail],
	);
	return { id: rows[0].id };
}

export async function cancelGroupInvitation(ownerEmail, groupId, invitationId) {
	const group = await getGroupMembership(ownerEmail, groupId);
	if (group.role !== 'owner') {
		throw createGroupError('Только владелец группы может отменить приглашение.', 403);
	}
	const { rows } = await pool.query(
		`UPDATE note_group_invitations SET status = 'cancelled'
		 WHERE id = $1 AND group_id = $2 AND status = 'pending'
		 RETURNING invitee_email`,
		[invitationId, groupId],
	);
	if (!rows[0]) throw createGroupError('Приглашение не найдено или уже обработано.', 404);
	await pool.query(
		`INSERT INTO collaboration_audit_log (group_id, actor_email, target_email, action)
		 VALUES ($1, $2, $3, 'invitation_cancelled')`,
		[groupId, ownerEmail, rows[0].invitee_email],
	);
	return { id: invitationId };
}

export async function respondToGroupInvitation(email, invitationId, accept) {
	const client = await pool.connect();
	let expired = false;
	try {
		await client.query('BEGIN');
		const { rows } = await client.query(
			`SELECT id, group_id, expires_at, role FROM note_group_invitations
			 WHERE id = $1 AND invitee_email = $2 AND status = 'pending'
			 FOR UPDATE`,
			[invitationId, email],
		);
		if (!rows[0]) throw createGroupError('Приглашение не найдено или уже обработано.', 404);
		const invitation = rows[0];
		if (new Date(invitation.expires_at) <= new Date()) {
			await client.query(
				`UPDATE note_group_invitations SET status = 'expired' WHERE id = $1`,
				[invitationId],
			);
			expired = true;
		} else {
			await client.query(
				'UPDATE note_group_invitations SET status = $2 WHERE id = $1',
				[invitationId, accept ? 'accepted' : 'declined'],
			);
			if (accept) {
				await client.query(
					`INSERT INTO note_group_members (group_id, email, role)
					 VALUES ($1, $2, $3)
					 ON CONFLICT (group_id, email) DO NOTHING`,
					[invitation.group_id, email, invitation.role],
				);
				await client.query(
					`INSERT INTO collaboration_audit_log (group_id, actor_email, target_email, action)
					 VALUES ($1, $2, $3, 'member_joined')`,
					[invitation.group_id, email, email],
				);
			}
		}
		await client.query('COMMIT');
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
	if (expired) throw createGroupError('Срок действия приглашения истёк.', 410);
	return { accepted: accept };
}

export async function listGroupNotes(email, groupId) {
	await getGroupMembership(email, groupId);
	const { rows } = await pool.query(
		`SELECT id, author_email AS "authorEmail", content
		 FROM note_group_notes WHERE group_id = $1 ORDER BY created_at, id`,
		[groupId],
	);
	return rows.map(({ id, authorEmail, content }) => ({ ...content, id, authorEmail }));
}

export async function createGroupNote(email, groupId, content) {
	const membership = await getGroupMembership(email, groupId);
	if (membership.role === 'reader') {
		throw createGroupError('Для создания заметок нужна роль редактора.', 403);
	}
	const id = randomUUID();
	const doc = new Y.Doc();
	doc.getText('title').insert(0, content.NameCore);
	doc.getText('body').insert(0, content.BioCore);
	const state = Y.encodeStateAsUpdate(doc);
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const { rows } = await client.query(
			`INSERT INTO note_group_notes (id, group_id, author_email, content)
			 VALUES ($1, $2, $3, $4::jsonb)
			 RETURNING id, author_email AS "authorEmail", content`,
			[id, groupId, email, JSON.stringify(content)],
		);
		await client.query(
			'INSERT INTO yjs_documents (note_id, state) VALUES ($1, $2)',
			[id, Buffer.from(state)],
		);
		await client.query(
			`INSERT INTO collaboration_audit_log (group_id, actor_email, action)
			 VALUES ($1, $2, 'note_created')`,
			[groupId, email],
		);
		await client.query('COMMIT');
		return { ...rows[0].content, id, authorEmail: rows[0].authorEmail };
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
		doc.destroy();
	}
}

export async function updateGroupNote(email, groupId, noteId, content) {
	const membership = await getGroupMembership(email, groupId);
	if (membership.role === 'reader') {
		throw createGroupError('Для изменения заметок нужна роль редактора.', 403);
	}
	const { rows } = await pool.query(
		`UPDATE note_group_notes n
		 SET content = (n.content || $4::jsonb)
			|| jsonb_build_object('NameCore', n.content->'NameCore', 'BioCore', n.content->'BioCore')
		 FROM note_groups g
		 WHERE n.id = $1 AND n.group_id = $2 AND g.id = n.group_id
			AND (n.author_email = $3 OR g.owner_email = $3 OR $5 = 'editor')
		 RETURNING n.id, n.author_email AS "authorEmail", n.content`,
		[noteId, groupId, email, JSON.stringify(content), membership.role],
	);
	if (!rows[0]) throw createGroupError('Заметка не найдена или изменить её нельзя.', 404);
	return { ...rows[0].content, id: rows[0].id, authorEmail: rows[0].authorEmail };
}

export async function deleteGroupNote(email, groupId, noteId) {
	const membership = await getGroupMembership(email, groupId);
	if (membership.role !== 'owner') {
		throw createGroupError('Удалять заметки группы может только её владелец.', 403);
	}
	const { rows } = await pool.query(
		`DELETE FROM note_group_notes n
		 USING note_groups g
		 WHERE n.id = $1 AND n.group_id = $2 AND g.id = n.group_id
			AND (n.author_email = $3 OR g.owner_email = $3)
		 RETURNING n.id`,
		[noteId, groupId, email],
	);
	if (!rows[0]) throw createGroupError('Удалять заметку может только её автор или владелец группы.', 403);
	await pool.query('DELETE FROM yjs_updates WHERE note_id = $1', [noteId]);
	await pool.query('DELETE FROM yjs_documents WHERE note_id = $1', [noteId]);
	return { id: rows[0].id };
}

export async function listFriends(email) {
	const { rows } = await pool.query(
		`SELECT u.email
		 FROM friend_requests f
		 JOIN users u ON u.email = CASE
			WHEN f.user_low = $1 THEN f.user_high ELSE f.user_low
		 END
		 WHERE (f.user_low = $1 OR f.user_high = $1) AND f.status = 'accepted'
		 ORDER BY u.email`,
		[email],
	);
	return rows.map((row) => row.email);
}

export async function listFriendRequests(email) {
	const { rows } = await pool.query(
		`SELECT id, requester_email AS "requesterEmail", created_at AS "createdAt"
		 FROM friend_requests
		 WHERE (user_high = $1 OR user_low = $1)
			AND requester_email <> $1 AND status = 'pending'
		 ORDER BY created_at`,
		[email],
	);
	return rows;
}

export async function sendFriendRequest(requesterEmail, targetEmail) {
	if (requesterEmail === targetEmail) {
		throw createGroupError('Нельзя отправить запрос в друзья самому себе.', 400);
	}
	const [userLow, userHigh] = [requesterEmail, targetEmail].sort();
	const { rows: users } = await pool.query(
		'SELECT email FROM users WHERE email = $1',
		[targetEmail],
	);
	if (!users[0]) throw createGroupError('Пользователь не найден.', 404);
	const { rows } = await pool.query(
		`INSERT INTO friend_requests (id, user_low, user_high, requester_email)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (user_low, user_high) WHERE status IN ('pending', 'accepted') DO NOTHING
		 RETURNING id`,
		[randomUUID(), userLow, userHigh, requesterEmail],
	);
	if (!rows[0]) {
		const { rows: existing } = await pool.query(
			'SELECT status, requester_email FROM friend_requests WHERE user_low = $1 AND user_high = $2',
			[userLow, userHigh],
		);
		const message = existing[0]?.status === 'accepted'
			? 'Этот пользователь уже в списке друзей.'
			: existing[0]?.status === 'pending'
				? 'Запрос в друзья уже отправлен или ожидает ответа.'
				: 'Запрос для этой пары уже обработан.';
		throw createGroupError(message, 409);
	}
	return { id: rows[0].id };
}

export async function respondToFriendRequest(email, requestId, accept) {
	const { rows } = await pool.query(
		`UPDATE friend_requests SET status = $3
		 WHERE id = $1 AND status = 'pending' AND requester_email <> $2
			AND (user_low = $2 OR user_high = $2)
		 RETURNING id`,
		[requestId, email, accept ? 'accepted' : 'declined'],
	);
	if (!rows[0]) throw createGroupError('Запрос в друзья не найден или уже обработан.', 404);
	return { accepted: accept };
}

export async function removeFriend(email, friendEmail) {
	const [userLow, userHigh] = [email, friendEmail].sort();
	const { rows } = await pool.query(
		`DELETE FROM friend_requests
		 WHERE user_low = $1 AND user_high = $2 AND status = 'accepted'
		 RETURNING id`,
		[userLow, userHigh],
	);
	if (!rows[0]) throw createGroupError('Пользователь не найден в списке друзей.', 404);
	return { email: friendEmail };
}

export async function getGroupNoteAccess(email, noteId) {
	const { rows } = await pool.query(
		`SELECT n.group_id AS "groupId", m.role, n.author_email AS "authorEmail"
		 FROM note_group_notes n
		 JOIN note_group_members m ON m.group_id = n.group_id
		 WHERE n.id = $1 AND m.email = $2`,
		[noteId, email],
	);
	if (!rows[0]) throw createGroupError('Заметка не найдена или у вас нет доступа.', 404);
	return { ...rows[0], canEdit: rows[0].role === 'owner' || rows[0].role === 'editor' };
}

async function getPersonalNoteAccess(email, noteId) {
	const { rows } = await pool.query(
		`SELECT owner.email AS "ownerEmail", note.value AS content,
			CASE WHEN owner.email = $1 THEN 'owner' ELSE share.role END AS role
		 FROM users owner
		 CROSS JOIN LATERAL jsonb_array_elements(owner.universe) AS note(value)
		 LEFT JOIN personal_note_shares share
			ON share.owner_email = owner.email
			AND share.note_id = $2
			AND share.shared_with_email = $1
		 WHERE note.value->>'id' = $2
			AND (owner.email = $1 OR share.shared_with_email = $1)
		 ORDER BY (owner.email = $1) DESC
		 LIMIT 1`,
		[email, noteId],
	);
	if (!rows[0]) throw createGroupError('Заметка не найдена или у вас нет доступа.', 404);
	return {
		...rows[0],
		canEdit: rows[0].role === 'owner' || rows[0].role === 'editor',
	};
}

export async function loadCollaborativeNote(email, noteId) {
	let access;
	let content;
	let state;
	try {
		access = await getGroupNoteAccess(email, noteId);
		const { rows } = await pool.query(
			`SELECT n.content, d.state
			 FROM note_group_notes n
			 LEFT JOIN yjs_documents d ON d.note_id = n.id
			 WHERE n.id = $1 AND n.group_id = $2`,
			[noteId, access.groupId],
		);
		content = rows[0]?.content;
		state = rows[0]?.state;
	} catch (error) {
		if (error.status !== 404) throw error;
		access = await getPersonalNoteAccess(email, noteId);
		content = access.content;
		const { rows } = await pool.query('SELECT state FROM yjs_documents WHERE note_id = $1', [noteId]);
		state = rows[0]?.state;
	}
	if (!content) throw createGroupError('Заметка не найдена.', 404);
	if (!state) {
		const doc = new Y.Doc();
		doc.getText('title').insert(0, content.NameCore || '');
		doc.getText('body').insert(0, content.BioCore || '');
		state = Buffer.from(Y.encodeStateAsUpdate(doc));
		doc.destroy();
		await pool.query(
			'INSERT INTO yjs_documents (note_id, state) VALUES ($1, $2) ON CONFLICT (note_id) DO NOTHING',
			[noteId, state],
		);
	}
	return { ...access, groupId: access.groupId || null, state };
}

export async function saveCollaborativeUpdate(email, noteId, update, state, title, body) {
	if (update.length > 5 * 1024 * 1024 || state.length > 5 * 1024 * 1024) {
		throw createGroupError('Обновление заметки превышает допустимый размер.', 413);
	}
	if (title.length > 200 || body.length > 50000) {
		throw createGroupError('Название или текст заметки превышает допустимую длину.', 413);
	}
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const { rows } = await client.query(
			`SELECT n.group_id AS "groupId", m.role
			 FROM note_group_notes n
			 JOIN note_group_members m ON m.group_id = n.group_id
			 WHERE n.id = $1 AND m.email = $2
			 FOR UPDATE OF n`,
			[noteId, email],
		);
		let noteAccess = rows[0];
		let isPersonalNote = false;
		if (!noteAccess) {
			const { rows: personalRows } = await client.query(
				`SELECT owner.email AS "ownerEmail",
					CASE WHEN owner.email = $2 THEN 'owner' ELSE share.role END AS role
				 FROM users owner
				 CROSS JOIN LATERAL jsonb_array_elements(owner.universe) AS note(value)
				 LEFT JOIN personal_note_shares share
					ON share.owner_email = owner.email
					AND share.note_id = $1
					AND share.shared_with_email = $2
				 WHERE note.value->>'id' = $1
					AND (owner.email = $2 OR share.shared_with_email = $2)
				 ORDER BY (owner.email = $2) DESC
				 LIMIT 1
				 FOR UPDATE OF owner`,
				[noteId, email],
			);
			noteAccess = personalRows[0];
			isPersonalNote = Boolean(noteAccess);
		}
		if (!noteAccess) throw createGroupError('Доступ к заметке отозван.', 403);
		if (!['owner', 'editor'].includes(noteAccess.role)) {
			throw createGroupError('Для редактирования нужна роль редактора.', 403);
		}
		await client.query(
			`INSERT INTO yjs_documents (note_id, state, updated_at)
			 VALUES ($1, $2, NOW())
			 ON CONFLICT (note_id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()`,
			[noteId, Buffer.from(state)],
		);
		await client.query(
			'INSERT INTO yjs_updates (note_id, update_data) VALUES ($1, $2)',
			[noteId, Buffer.from(update)],
		);
		await client.query(
			`DELETE FROM yjs_updates
			 WHERE note_id = $1 AND id NOT IN (
				SELECT id FROM yjs_updates WHERE note_id = $1 ORDER BY id DESC LIMIT 500
			 )`,
			[noteId],
		);
		if (isPersonalNote) {
			await client.query(
				`UPDATE users owner SET universe = (
					SELECT jsonb_agg(
						CASE WHEN note.value->>'id' = $2 THEN
							jsonb_set(
								jsonb_set(note.value, '{NameCore}', to_jsonb($3::text), true),
								'{BioCore}', to_jsonb($4::text), true
							)
						ELSE note.value END
						ORDER BY note.ordinality
					)
					FROM jsonb_array_elements(owner.universe) WITH ORDINALITY AS note(value, ordinality)
				)
				WHERE owner.email = $1`,
				[noteAccess.ownerEmail, noteId, title, body],
			);
		} else {
			await client.query(
				`UPDATE note_group_notes SET content =
					jsonb_set(
						jsonb_set(content, '{NameCore}', to_jsonb($2::text), true),
						'{BioCore}', to_jsonb($3::text), true
					)
				 WHERE id = $1`,
				[noteId, title, body],
			);
		}
		await client.query('COMMIT');
		return { groupId: noteAccess.groupId || null };
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
}

export function deleteSession(token) {
	sessions.delete(token);
}

export async function closeDatabase() {
	await pool.end();
}
