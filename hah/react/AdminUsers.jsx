import React, { useEffect, useState } from 'react';

const API_URL = 'http://localhost:3000/registretion';

const AdminUsers = ({ token, currentUserEmail, onClose }) => {
	const [users, setUsers] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [deletingEmail, setDeletingEmail] = useState('');

	useEffect(() => {
		const controller = new AbortController();
		const loadUsers = async () => {
			setLoading(true);
			setError('');
			try {
				const response = await fetch(`${API_URL}/admin/users`, {
					headers: { Authorization: `Bearer ${token}` },
					signal: controller.signal,
				});
				const data = await response.json();
				if (!response.ok) throw new Error(data.error || 'Не удалось загрузить пользователей.');
				setUsers(data.users);
			} catch (requestError) {
				if (requestError.name !== 'AbortError') {
					setError(requestError.message || 'Не удалось загрузить пользователей.');
				}
			} finally {
				if (!controller.signal.aborted) setLoading(false);
			}
		};

		loadUsers();
		return () => controller.abort();
	}, [token]);

	const removeUser = async (email) => {
		if (!window.confirm(`Удалить пользователя ${email}? Это действие нельзя отменить.`)) return;
		setDeletingEmail(email);
		setError('');
		try {
			const response = await fetch(`${API_URL}/admin/users/${encodeURIComponent(email)}`, {
				method: 'DELETE',
				headers: { Authorization: `Bearer ${token}` },
			});
			const data = response.status === 204 ? {} : await response.json();
			if (!response.ok) throw new Error(data.error || 'Не удалось удалить пользователя.');
			setUsers((previous) => previous.filter((userItem) => userItem.email !== email));
		} catch (requestError) {
			setError(requestError.message || 'Не удалось удалить пользователя.');
		} finally {
			setDeletingEmail('');
		}
	};

	return (
		<div className="AdminUsersBackdrop" onMouseDown={(event) => {
			if (event.target === event.currentTarget) onClose();
		}}>
			<section className="AdminUsersDialog" role="dialog" aria-modal="true" aria-labelledby="AdminUsersTitle">
				<header className="AdminUsersHeader">
					<h2 id="AdminUsersTitle">Пользователи</h2>
					<button type="button" className="AdminUsersClose" onClick={onClose} aria-label="Закрыть">
						×
					</button>
				</header>
				{loading && <p role="status">Загрузка...</p>}
				{error && <p className="AdminUsersError" role="alert">{error}</p>}
				{!loading && (
					<div className="AdminUsersList">
						{users.map((userItem) => (
							<article className="AdminUserRow" key={userItem.email}>
								<div>
									<strong>{userItem.email}</strong>
									<div className="AdminUserMeta">
										{userItem.isAdmin ? 'Администратор' : 'Пользователь'}
										{' · '}
										Заметок: {userItem.noteCount}
									</div>
								</div>
								{userItem.email !== currentUserEmail && (
									<button
										type="button"
										className="AdminUserDelete"
										disabled={Boolean(deletingEmail)}
										onClick={() => removeUser(userItem.email)}
									>
										{deletingEmail === userItem.email ? 'Удаление...' : 'Удалить'}
									</button>
								)}
							</article>
						))}
						{users.length === 0 && <p>Пользователей пока нет.</p>}
					</div>
				)}
			</section>
		</div>
	);
};

export default AdminUsers;
