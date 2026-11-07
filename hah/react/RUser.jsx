import React, { useState } from 'react';
import User from '../svg/User.jsx';
import Logout from '../svg/Logout';
import AdminUsers from './AdminUsers.jsx';

const API_URL = 'http://localhost:3000/registretion';

const RUser = ({
	setUser,
	setPassword,
	user,
	password,
	isAuthenticated,
	isAdmin,
	token,
	onAuthenticated,
	onLogout,
	saveStatus,
}) => {
	const [showAuth, setShowAuth] = useState(false);
	const [showAdminUsers, setShowAdminUsers] = useState(false);
	const [mode, setMode] = useState('login');
	const [repeatPassword, setRepeatPassword] = useState('');
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);

	const submitAuth = async (event) => {
		event.preventDefault();
		setError('');
		if (mode === 'register' && password !== repeatPassword) {
			setError('Пароли не совпадают.');
			return;
		}

		setBusy(true);
		try {
			const response = await fetch(`${API_URL}/${mode}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: user, password }),
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || 'Не удалось выполнить запрос.');

			onAuthenticated(data);
			setPassword('');
			setRepeatPassword('');
			setShowAuth(false);
		} catch (requestError) {
			setError(requestError.message || 'Сервер недоступен. Попробуйте позже.');
		} finally {
			setBusy(false);
		}
	};

	const logout = async () => {
		setError('');
		try {
			await onLogout();
		} catch (requestError) {
			setError(requestError.message || 'Не удалось сохранить данные перед выходом.');
		}
	};

	return (
		<div className="rUser">
			<User
				title={isAuthenticated ? user : 'Войти или зарегистрироваться'}
				onClick={() => {
					if (isAuthenticated) return;
					setShowAuth(!showAuth);
					setError('');
				}}
			/>
			{isAuthenticated && <Logout onClick={logout} />}
			{isAdmin && (
				<button
					type="button"
					className="AdminUsersButton"
					onClick={() => setShowAdminUsers(true)}
					aria-label="Просмотреть пользователей"
					title="Просмотреть пользователей"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
						<circle cx="10" cy="7" r="4" />
						<path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
					</svg>
				</button>
			)}
			{showAdminUsers && (
				<AdminUsers
					token={token}
					currentUserEmail={user}
					onClose={() => setShowAdminUsers(false)}
				/>
			)}
			{saveStatus && <div className="SaveStatus" role="status">{saveStatus}</div>}
			{showAuth && (
				<form className={`Authorization ${mode === 'register' ? 'AuthorizationRegister' : ''}`} onSubmit={submitAuth}>
					<button
						type="button"
						className={`Login ${mode === 'login' ? 'AuthSelected' : ''}`}
						onClick={() => { setMode('login'); setError(''); }}
					>
						Вход
					</button>
					<button
						type="button"
						className={`Registration ${mode === 'register' ? 'AuthSelected' : ''}`}
						onClick={() => { setMode('register'); setError(''); }}
					>
						Регистрация
					</button>
					<input
						className="Email"
						type="email"
						placeholder="Email"
						autoComplete="email"
						value={user}
						onChange={(event) => setUser(event.target.value)}
						required
					/>
					<input
						className="Password"
						type="password"
						placeholder="Пароль"
						autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
						value={password}
						onChange={(event) => setPassword(event.target.value)}
						minLength={mode === 'register' ? 8 : undefined}
						required
					/>
					{mode === 'register' && (
						<input
							className="REpassword"
							type="password"
							placeholder="Повторите пароль"
							autoComplete="new-password"
							value={repeatPassword}
							onChange={(event) => setRepeatPassword(event.target.value)}
							required
						/>
					)}
					{error && <div className="AuthError" role="alert">{error}</div>}
					<button className="ButtonL" type="submit" disabled={busy}>
						{busy ? 'Подождите...' : mode === 'register' ? 'Создать аккаунт' : 'Войти'}
					</button>
				</form>
			)}
		</div>
	);
};

export default RUser;
