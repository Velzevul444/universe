import React, { useEffect, useState } from 'react';

const API_URL = 'http://localhost:3000/registretion';

async function request(path, token, options = {}) {
	const response = await fetch(`${API_URL}${path}`, {
		...options,
		headers: {
			...(options.body ? { 'Content-Type': 'application/json' } : {}),
			Authorization: `Bearer ${token}`,
			...options.headers,
		},
	});
	const data = response.status === 204 ? {} : await response.json();
	if (!response.ok) throw new Error(data.error || 'Не удалось выполнить запрос.');
	return data;
}

const GroupsPanel = ({
	token,
	currentUserEmail,
	selectedGroupId,
	isSharedNoteSelected,
	onSelectGroup,
	onSelectSharedNote,
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const [groups, setGroups] = useState([]);
	const [sharedNotes, setSharedNotes] = useState([]);
	const [invitations, setInvitations] = useState([]);
	const [friends, setFriends] = useState([]);
	const [friendRequests, setFriendRequests] = useState([]);
	const [groupDetails, setGroupDetails] = useState(null);
	const [groupName, setGroupName] = useState('');
	const [inviteEmail, setInviteEmail] = useState('');
	const [inviteRole, setInviteRole] = useState('editor');
	const [friendEmail, setFriendEmail] = useState('');
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		if (!isOpen) return undefined;
		const controller = new AbortController();
		const load = async () => {
			setError('');
			try {
				const [groupData, invitationData, friendData, friendRequestData, sharedNoteData] = await Promise.all([
					request('/groups', token, { signal: controller.signal }),
					request('/group-invitations', token, { signal: controller.signal }),
					request('/friends', token, { signal: controller.signal }),
					request('/friend-requests', token, { signal: controller.signal }),
					request('/shared-notes', token, { signal: controller.signal }),
				]);
				setGroups(groupData.groups);
				setSharedNotes(sharedNoteData.notes);
				setInvitations(invitationData.invitations);
				setFriends(friendData.friends);
				setFriendRequests(friendRequestData.requests);
			} catch (requestError) {
				if (requestError.name !== 'AbortError') setError(requestError.message);
			}
		};
		load();
		return () => controller.abort();
	}, [isOpen, token]);

	useEffect(() => {
		if (!isOpen || !selectedGroupId) {
			setGroupDetails(null);
			return undefined;
		}
		setGroupDetails(null);
		const controller = new AbortController();
		request(`/groups/${encodeURIComponent(selectedGroupId)}`, token, { signal: controller.signal })
			.then((data) => setGroupDetails(data.group))
			.catch((requestError) => {
				if (requestError.name !== 'AbortError') setError(requestError.message);
			});
		return () => controller.abort();
	}, [isOpen, selectedGroupId, token]);

	const createGroup = async (event) => {
		event.preventDefault();
		setBusy(true);
		setError('');
		try {
			const data = await request('/groups', token, {
				method: 'POST',
				body: JSON.stringify({ name: groupName }),
			});
			setGroups((previous) => [...previous, data.group]);
			setGroupName('');
			onSelectGroup(data.group);
			setIsOpen(false);
		} catch (requestError) {
			setError(requestError.message);
		} finally {
			setBusy(false);
		}
	};

	const inviteMember = async (event) => {
		event.preventDefault();
		if (!selectedGroupId) return;
		setBusy(true);
		setError('');
		try {
			const invitation = await request(`/groups/${encodeURIComponent(selectedGroupId)}/invitations`, token, {
				method: 'POST',
				body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
			});
			const sentTo = inviteEmail;
			setInviteEmail('');
			setInviteRole('editor');
			setGroupDetails((previous) => previous
				? {
					...previous,
					pendingInviteEmail: sentTo,
					pendingInvitations: [
						...(previous.pendingInvitations || []),
						{ id: invitation.id, inviteeEmail: sentTo, role: inviteRole },
					],
				}
				: previous);
		} catch (requestError) {
			setError(requestError.message);
		} finally {
			setBusy(false);
		}
	};

	const cancelInvitation = async (invitationId) => {
		setBusy(true);
		setError('');
		try {
			await request(
				`/groups/${encodeURIComponent(selectedGroupId)}/invitations/${encodeURIComponent(invitationId)}`,
				token,
				{ method: 'DELETE' },
			);
			setGroupDetails((previous) => previous
				? {
					...previous,
					pendingInvitations: previous.pendingInvitations.filter((item) => item.id !== invitationId),
				}
				: previous);
		} catch (requestError) {
			setError(requestError.message);
		} finally {
			setBusy(false);
		}
	};

	const respondToInvitation = async (invitationId, response) => {
		setBusy(true);
		setError('');
		try {
			await request(`/group-invitations/${encodeURIComponent(invitationId)}/${response}`, token, {
				method: 'POST',
			});
			setInvitations((previous) => previous.filter((invitation) => invitation.id !== invitationId));
			if (response === 'accept') {
				const data = await request('/groups', token);
				setGroups(data.groups);
			}
		} catch (requestError) {
			setError(requestError.message);
		} finally {
			setBusy(false);
		}
	};

	const sendFriendRequest = async (event) => {
		event.preventDefault();
		setBusy(true);
		setError('');
		try {
			await request('/friend-requests', token, {
				method: 'POST',
				body: JSON.stringify({ email: friendEmail }),
			});
			setFriendEmail('');
		} catch (requestError) {
			setError(requestError.message);
		} finally {
			setBusy(false);
		}
	};

	const respondToFriendRequest = async (requestId, response) => {
		setBusy(true);
		setError('');
		try {
			await request(`/friend-requests/${encodeURIComponent(requestId)}/${response}`, token, {
				method: 'POST',
			});
			setFriendRequests((previous) => previous.filter((item) => item.id !== requestId));
			if (response === 'accept') {
				const data = await request('/friends', token);
				setFriends(data.friends);
			}
		} catch (requestError) {
			setError(requestError.message);
		} finally {
			setBusy(false);
		}
	};

	const removeMember = async (email) => {
		setBusy(true);
		setError('');
		try {
			await request(
				`/groups/${encodeURIComponent(selectedGroupId)}/members/${encodeURIComponent(email)}`,
				token,
				{ method: 'DELETE' },
			);
			setGroupDetails((previous) => previous
				? { ...previous, members: previous.members.filter((member) => member.email !== email) }
				: previous);
			if (email === currentUserEmail) {
				setGroups((previous) => previous.filter((group) => group.id !== selectedGroupId));
				onSelectGroup(null);
				setIsOpen(false);
			}
		} catch (requestError) {
			setError(requestError.message);
		} finally {
			setBusy(false);
		}
	};

	const changeMemberRole = async (email, role) => {
		setBusy(true);
		setError('');
		try {
			await request(
				`/groups/${encodeURIComponent(selectedGroupId)}/members/${encodeURIComponent(email)}`,
				token,
				{ method: 'PATCH', body: JSON.stringify({ role }) },
			);
			setGroupDetails((previous) => previous
				? {
					...previous,
					members: previous.members.map((member) => (
						member.email === email ? { ...member, role } : member
					)),
				}
				: previous);
		} catch (requestError) {
			setError(requestError.message);
		} finally {
			setBusy(false);
		}
	};

	const removeGroup = async () => {
		if (!window.confirm(`Удалить группу «${groupDetails.name}» и все её заметки?`)) return;
		setBusy(true);
		setError('');
		try {
			await request(`/groups/${encodeURIComponent(selectedGroupId)}`, token, { method: 'DELETE' });
			setGroups((previous) => previous.filter((group) => group.id !== selectedGroupId));
			onSelectGroup(null);
			setIsOpen(false);
		} catch (requestError) {
			setError(requestError.message);
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="GroupsPanel">
			<button
				type="button"
				className="GroupsToggle"
				onClick={() => { setIsOpen((open) => !open); setError(''); }}
				aria-expanded={isOpen}
			>
				Группы
			</button>
			{isOpen && (
				<div className="GroupsBackdrop" onMouseDown={(event) => {
					if (event.target === event.currentTarget) setIsOpen(false);
				}}>
					<section className="GroupsDialog" role="dialog" aria-modal="true" aria-labelledby="GroupsTitle">
						<header className="GroupsHeader">
							<h2 id="GroupsTitle">Группы и общие заметки</h2>
							<button type="button" className="GroupsClose" onClick={() => setIsOpen(false)} aria-label="Закрыть">
								×
							</button>
						</header>
						<button
							type="button"
							className={`GroupRow ${!selectedGroupId && !isSharedNoteSelected ? 'GroupSelected' : ''}`}
							onClick={() => { onSelectGroup(null); setIsOpen(false); }}
						>
							Мои заметки
						</button>
						<h3>Мои группы</h3>
						<div className="GroupsList">
							{groups.map((group) => (
								<button
									type="button"
									className={`GroupRow ${selectedGroupId === group.id ? 'GroupSelected' : ''}`}
									key={group.id}
									onClick={() => { onSelectGroup(group); setIsOpen(false); }}
								>
									<span>{group.name}</span>
									<span className="GroupMeta">{group.memberCount} участн. · {group.noteCount} заметок</span>
								</button>
							))}
							{groups.length === 0 && <p className="GroupsHint">Вы пока не состоите в группах.</p>}
						</div>
						<h3>Личные заметки, доступные вам</h3>
						<div className="GroupsList">
							{sharedNotes.map((note) => (
								<button
									type="button"
									className="GroupRow"
									key={`${note.ownerEmail}:${note.id}`}
									onClick={() => {
										onSelectSharedNote(note);
										setIsOpen(false);
									}}
								>
									<span>{note.NameCore || 'Без названия'}</span>
									<span className="GroupMeta">
										{note.ownerEmail} · {note.role === 'editor' ? 'Редактор' : 'Читатель'}
									</span>
								</button>
							))}
							{sharedNotes.length === 0 && (
								<p className="GroupsHint">Пока никто не поделился с вами личными заметками.</p>
							)}
						</div>
						<form className="GroupForm" onSubmit={createGroup}>
							<input
								value={groupName}
								onChange={(event) => setGroupName(event.target.value)}
								placeholder="Название новой группы"
								maxLength={60}
								required
							/>
							<button type="submit" disabled={busy}>Создать</button>
						</form>
						{invitations.length > 0 && (
							<>
								<h3>Приглашения</h3>
								<div className="GroupsList">
									{invitations.map((invitation) => (
										<div className="GroupInvitation" key={invitation.id}>
											<div>
												<strong>{invitation.groupName}</strong>
												<div className="GroupMeta">От {invitation.inviterEmail}</div>
											</div>
											<div className="GroupActions">
												<button type="button" disabled={busy} onClick={() => respondToInvitation(invitation.id, 'accept')}>
													Принять
												</button>
												<button type="button" disabled={busy} onClick={() => respondToInvitation(invitation.id, 'decline')}>
													Отклонить
												</button>
											</div>
										</div>
									))}
								</div>
							</>
						)}
						<h3>Друзья</h3>
						<div className="GroupsList">
							{friends.map((friend) => (
								<div className="GroupMember" key={friend}>
									<span>{friend}</span>
									<button
										type="button"
										className="GroupRemove"
										disabled={busy}
										onClick={async () => {
											try {
												await request(`/friends/${encodeURIComponent(friend)}`, token, { method: 'DELETE' });
												setFriends((previous) => previous.filter((email) => email !== friend));
											} catch (requestError) {
												setError(requestError.message);
											}
										}}
									>
										Удалить
									</button>
								</div>
							))}
							{friends.length === 0 && <p className="GroupsHint">Список друзей пока пуст.</p>}
						</div>
						<form className="GroupForm" onSubmit={sendFriendRequest}>
							<input
								type="email"
								value={friendEmail}
								onChange={(event) => setFriendEmail(event.target.value)}
								placeholder="Email для запроса в друзья"
								required
							/>
							<button type="submit" disabled={busy}>Добавить</button>
						</form>
						{friendRequests.length > 0 && (
							<div className="GroupsList">
								{friendRequests.map((item) => (
									<div className="GroupInvitation" key={item.id}>
										<span>{item.requesterEmail}</span>
										<div className="GroupActions">
											<button type="button" disabled={busy} onClick={() => respondToFriendRequest(item.id, 'accept')}>
												Принять
											</button>
											<button type="button" disabled={busy} onClick={() => respondToFriendRequest(item.id, 'decline')}>
												Отклонить
											</button>
										</div>
									</div>
								))}
							</div>
						)}
						{groupDetails && (
							<>
								<h3>Участники: {groupDetails.name}</h3>
								<div className="GroupsList">
									{groupDetails.members.map((member) => (
										<div className="GroupMember" key={member.email}>
											<span>{member.email}</span>
											{member.role === 'owner' ? (
												<span className="GroupMeta">Владелец</span>
											) : groupDetails.role === 'owner' ? (
												<div className="GroupActions">
													<select
														aria-label={`Роль ${member.email}`}
														value={member.role}
														disabled={busy}
														onChange={(event) => changeMemberRole(member.email, event.target.value)}
													>
														<option value="editor">Редактор</option>
														<option value="reader">Читатель</option>
													</select>
													<button type="button" disabled={busy} onClick={() => removeMember(member.email)}>
														Исключить
													</button>
												</div>
											) : (
												<>
													<span className="GroupMeta">{member.role === 'reader' ? 'Читатель' : 'Редактор'}</span>
													{member.email === currentUserEmail && (
														<button type="button" className="GroupRemove" disabled={busy} onClick={() => removeMember(member.email)}>
															Выйти
														</button>
													)}
												</>
											)}
										</div>
									))}
								</div>
								{groupDetails.role === 'owner' && (
									<button type="button" className="GroupDelete" disabled={busy} onClick={removeGroup}>
										Удалить группу
									</button>
								)}
								{groupDetails.role === 'owner' && (
									<>
										{groupDetails.pendingInvitations?.map((invitation) => (
											<div className="GroupMember" key={invitation.id}>
												<span>
													{invitation.inviteeEmail}
													<span className="GroupMeta">
														{' · '}
														{invitation.role === 'reader' ? 'Читатель' : 'Редактор'} · ожидает ответа
													</span>
												</span>
												<button
													type="button"
													className="GroupRemove"
													disabled={busy}
													onClick={() => cancelInvitation(invitation.id)}
												>
													Отменить
												</button>
											</div>
										))}
										<form className="GroupForm" onSubmit={inviteMember}>
											{friends.length > 0 && (
												<select
													value={friends.includes(inviteEmail) ? inviteEmail : ''}
													onChange={(event) => setInviteEmail(event.target.value)}
													aria-label="Выбрать друга"
												>
													<option value="">Выбрать друга</option>
													{friends.map((friend) => <option key={friend} value={friend}>{friend}</option>)}
												</select>
											)}
											<input
												type="email"
												value={inviteEmail}
												onChange={(event) => setInviteEmail(event.target.value)}
												placeholder="Email участника"
												required
											/>
											<select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)} aria-label="Роль приглашённого">
												<option value="editor">Редактор</option>
												<option value="reader">Читатель</option>
											</select>
											<button type="submit" disabled={busy}>Пригласить</button>
										</form>
										{groupDetails.pendingInviteEmail && (
											<p className="GroupsHint">Приглашение отправлено: {groupDetails.pendingInviteEmail}</p>
										)}
									</>
								)}
							</>
						)}
						{error && <p className="GroupsError" role="alert">{error}</p>}
					</section>
				</div>
			)}
		</div>
	);
};

export default GroupsPanel;
