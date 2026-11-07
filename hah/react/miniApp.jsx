import React, { useEffect, useState } from 'react';
import AtomIcon from './AtomIcon.jsx';
import RUser from './RUser.jsx';
import CreateNote from './CreateNote.jsx';
import TreeNote from './TreeNote';
import GroupsPanel from './GroupsPanel.jsx';

const API_URL = 'http://localhost:3000/registretion';
const TOKEN_KEY = 'universe-auth-token';

const MiniApp = () => {
	const [user, setUser] = useState('');
	const [password, setPassword] = useState('');
	const [token, setToken] = useState('');
	const [isAdmin, setIsAdmin] = useState(false);
	const [saveStatus, setSaveStatus] = useState('');
	const [isLoaded, setIsLoaded] = useState(false);
	const [NameCore, setNameCore] = useState('');
	const [BioCore, setBioCore] = useState('');
	const [RoundCore, setRoundCore] = useState(true);
	const [ColorCore, setColorCore] = useState('');
	const [personalElements, setPersonalElements] = useState([]);
	const [groupElements, setGroupElements] = useState([]);
	const [selectedGroup, setSelectedGroup] = useState(null);
	const [selectedSharedNote, setSelectedSharedNote] = useState(null);
	const Elements = selectedGroup
		? groupElements
		: selectedSharedNote
			? [selectedSharedNote]
			: personalElements;
	const setElements = selectedGroup ? setGroupElements : setPersonalElements;
	const [CreateCore, setCreateCore] = useState(false);
	const [DeleteCore, setDeleteCore] = useState(false);
	const [ChoiceCore, setChoiceCore] = useState(true);
	const [isLinkMode, setIsLinkMode] = useState(false);
	const [selectedCoreId, setSelectedCoreId] = useState('');
	const [editingNoteId, setEditingNoteId] = useState(null);

	useEffect(() => {
		const savedToken = window.localStorage.getItem(TOKEN_KEY);
		if (!savedToken) {
			setIsLoaded(true);
			return undefined;
		}

		const controller = new AbortController();
		fetch(`${API_URL}/me`, {
			headers: { Authorization: `Bearer ${savedToken}` },
			signal: controller.signal,
		})
			.then(async (response) => {
				const data = await response.json();
				if (!response.ok) throw new Error(data.error || 'Не удалось восстановить сессию.');
				setUser(data.email);
				setIsAdmin(data.isAdmin === true);
				setPersonalElements(data.universe.map((note) => ({
					...note,
					id: note.id || window.crypto.randomUUID(),
				})));
				setToken(savedToken);
			})
			.catch((error) => {
				if (error.name === 'AbortError') return;
				window.localStorage.removeItem(TOKEN_KEY);
				setSaveStatus('Сессия завершена. Войдите снова.');
			})
			.finally(() => setIsLoaded(true));

		return () => controller.abort();
	}, []);

	const saveUniverse = async (authToken = token, universe = personalElements) => {
		if (!authToken) return;
		const response = await fetch(`${API_URL}/universe`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${authToken}`,
			},
			body: JSON.stringify({ universe }),
		});
		const data = await response.json();
		if (!response.ok) throw new Error(data.error || 'Не удалось сохранить данные.');
		setSaveStatus('Сохранено');
	};

	useEffect(() => {
		if (!token || !isLoaded || selectedGroup) return undefined;

		const timeout = window.setTimeout(() => {
			setSaveStatus('Сохранение...');
			saveUniverse().catch((error) => {
				setSaveStatus(`Ошибка сохранения: ${error.message}`);
			});
		}, 500);
		return () => window.clearTimeout(timeout);
	}, [personalElements, isLoaded, selectedGroup, token]);

	useEffect(() => {
		if (!token || !selectedGroup) return undefined;
		const controller = new AbortController();
		let timeout;
		const loadNotes = async () => {
			try {
				const response = await fetch(
					`${API_URL}/groups/${encodeURIComponent(selectedGroup.id)}/notes`,
					{ headers: { Authorization: `Bearer ${token}` }, signal: controller.signal },
				);
				const data = await response.json();
				if (response.status === 401 || response.status === 403 || response.status === 404) {
					setSelectedGroup(null);
					setGroupElements([]);
					setSaveStatus(data.error || 'Доступ к группе отозван.');
					return;
				}
				if (!response.ok) throw new Error(data.error || 'Не удалось загрузить заметки группы.');
				const groupResponse = await fetch(
					`${API_URL}/groups/${encodeURIComponent(selectedGroup.id)}`,
					{ headers: { Authorization: `Bearer ${token}` }, signal: controller.signal },
				);
				const groupData = await groupResponse.json();
				if (!groupResponse.ok) throw new Error(groupData.error || 'Не удалось проверить права группы.');
				setGroupElements(data.notes);
				setSelectedGroup(groupData.group);
				if (!editingNoteId) setSaveStatus('Группа синхронизирована');
			} catch (error) {
				if (error.name !== 'AbortError') setSaveStatus(`Ошибка группы: ${error.message}`);
			} finally {
				if (!controller.signal.aborted) timeout = window.setTimeout(loadNotes, 3000);
			}
		};
		loadNotes();
		return () => {
			controller.abort();
			window.clearTimeout(timeout);
		};
	}, [selectedGroup?.id, token, editingNoteId]);

	const handleAuthenticated = (data) => {
		window.localStorage.setItem(TOKEN_KEY, data.token);
		setUser(data.email);
		setIsAdmin(data.isAdmin === true);
		setPersonalElements(data.universe.map((note) => ({
			...note,
			id: note.id || window.crypto.randomUUID(),
		})));
		setToken(data.token);
		setIsLoaded(true);
		setSaveStatus('Вход выполнен');
	};

	const handleLogout = async () => {
		await saveUniverse();
		const response = await fetch(`${API_URL}/logout`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}` },
		});
		if (!response.ok) {
			const data = await response.json();
			throw new Error(data.error || 'Не удалось выйти из аккаунта.');
		}
		window.localStorage.removeItem(TOKEN_KEY);
		setToken('');
		setUser('');
		setIsAdmin(false);
		setPersonalElements([]);
		setGroupElements([]);
		setSelectedGroup(null);
		setSelectedSharedNote(null);
		setSaveStatus('Вы вышли из аккаунта');
	};

	const AddCore = async () => {
		if (!token) return false;
		if (editingNoteId) {
			const noteToEdit = Elements.find((note) => note.id === editingNoteId);
			if (!noteToEdit || (!noteToEdit.ChoiceCore && !selectedCoreId)) return false;
			const updatedNote = {
				...noteToEdit,
				NameCore,
				BioCore,
				ColorCore,
				parentCoreId: noteToEdit.ChoiceCore ? undefined : selectedCoreId,
			};
			if (selectedGroup) {
				const response = await fetch(
					`${API_URL}/groups/${encodeURIComponent(selectedGroup.id)}/notes/${encodeURIComponent(editingNoteId)}`,
					{
						method: 'PUT',
						headers: {
							'Content-Type': 'application/json',
							Authorization: `Bearer ${token}`,
						},
						body: JSON.stringify({ note: updatedNote }),
					},
				);
				const data = await response.json();
				if (!response.ok) throw new Error(data.error || 'Не удалось сохранить заметку группы.');
				setGroupElements((previous) => previous.map((note) => (
					note.id === editingNoteId ? data.note : note
				)));
				return true;
			}
			if (selectedSharedNote) {
				const response = await fetch(
					`${API_URL}/shared-notes/${encodeURIComponent(selectedSharedNote.ownerEmail)}/${encodeURIComponent(editingNoteId)}`,
					{
						method: 'PUT',
						headers: {
							'Content-Type': 'application/json',
							Authorization: `Bearer ${token}`,
						},
						body: JSON.stringify({ note: updatedNote }),
					},
				);
				const data = await response.json();
				if (!response.ok) throw new Error(data.error || 'Не удалось сохранить заметку.');
				setSelectedSharedNote(data.note);
				return true;
			}
			setElements((previous) => previous.map((note) => (
				note.id === editingNoteId
					? updatedNote
					: note
			)));
			return true;
		}

		const normalized = Elements.map((note) => ({
			...note,
			id: note.id || window.crypto.randomUUID(),
		}));
		const newNote = {
			id: window.crypto.randomUUID(),
			rotation: Elements.length * 60,
			NameCore,
			ColorCore,
			BioCore,
			ChoiceCore,
		};
		if (!ChoiceCore) {
			if (!normalized.some((note) => note.ChoiceCore && note.id === selectedCoreId)) return false;
			newNote.parentCoreId = selectedCoreId;
		}

		if (selectedGroup) {
			const response = await fetch(
				`${API_URL}/groups/${encodeURIComponent(selectedGroup.id)}/notes`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({ note: newNote }),
				},
			);
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || 'Не удалось добавить заметку в группу.');
			setGroupElements((previous) => [...previous, data.note]);
			setSaveStatus('Заметка добавлена в группу');
			return true;
		}

		setElements((previous) => {
			const normalized = previous.map((note) => ({
				...note,
				id: note.id || window.crypto.randomUUID(),
			}));
			return [...normalized, newNote];
		});
		return true;
	};

	const editNote = (noteIndex) => {
		const note = Elements[noteIndex];
		if (!note || !canEditNote(note)) return;
		setEditingNoteId(note.id);
		setNameCore(note.NameCore || '');
		setBioCore(note.BioCore || '');
		setColorCore(note.ColorCore || '');
		setChoiceCore(Boolean(note.ChoiceCore));
		setSelectedCoreId(note.parentCoreId || '');
		setIsLinkMode(false);
	};

	const cancelEdit = () => {
		setEditingNoteId(null);
		setNameCore('');
		setBioCore('');
		setSelectedCoreId('');
		setColorCore('');
		setChoiceCore(true);
	};

	const moveNode = (noteIndex, position) => {
		if (selectedGroup || selectedSharedNote) return;
		setElements((previous) => previous.map((note, index) => (
			index === noteIndex ? { ...note, position, positionCustom: true } : note
		)));
	};

	const deleteNote = async (noteIndex) => {
		if (selectedSharedNote) return;
		const noteToDelete = Elements[noteIndex];
		if (selectedGroup) {
			if (!noteToDelete) return;
			try {
				const response = await fetch(
					`${API_URL}/groups/${encodeURIComponent(selectedGroup.id)}/notes/${encodeURIComponent(noteToDelete.id)}`,
					{
						method: 'DELETE',
						headers: { Authorization: `Bearer ${token}` },
					},
				);
				const data = response.status === 204 ? {} : await response.json();
				if (!response.ok) throw new Error(data.error || 'Не удалось удалить заметку группы.');
				setGroupElements((previous) => previous.filter((note) => note.id !== noteToDelete.id));
				setSaveStatus('Заметка удалена');
			} catch (error) {
				setSaveStatus(`Ошибка удаления: ${error.message}`);
			}
			return;
		}
		if (Elements[noteIndex]?.id === selectedCoreId) setSelectedCoreId('');
		if (Elements[noteIndex]?.id === editingNoteId) cancelEdit();
		setElements((previous) => {
			const removed = previous[noteIndex];
			const removedId = removed?.id;
			const remaining = previous
				.filter((_, index) => index !== noteIndex)
				.map((note) => ({
					...note,
					links: (note.links || []).filter((id) => id !== removedId),
				}));
			if (!removed?.ChoiceCore) return remaining;

			const fallbackCoreId = remaining.find((note) => note.ChoiceCore)?.id || null;
			return remaining.map((note) => (
				note.parentCoreId === removedId
					? { ...note, parentCoreId: fallbackCoreId, positionCustom: false }
					: note
			));
		});
	};

	const selectGroup = (group) => {
		setSelectedGroup(group);
		setSelectedSharedNote(null);
		setGroupElements([]);
		setIsLinkMode(false);
		cancelEdit();
	};

	const canEditNote = () => !selectedGroup
		? !selectedSharedNote || selectedSharedNote.role === 'editor'
		: selectedGroup.role === 'owner' || selectedGroup.role === 'editor';

	const selectSharedNote = (note) => {
		setSelectedGroup(null);
		setSelectedSharedNote(note);
		setGroupElements([]);
		setIsLinkMode(false);
		cancelEdit();
	};

	const linkNotes = (sourceIndex, targetIndex) => {
		if (selectedSharedNote) return;
		setElements((previous) => {
			if (!previous[sourceIndex] || !previous[targetIndex]) return previous;
			const ids = previous.map((note) => note.id || window.crypto.randomUUID());
			const isLinked = (previous[sourceIndex].links || []).includes(ids[targetIndex])
				|| (previous[targetIndex].links || []).includes(ids[sourceIndex]);

			return previous.map((note, index) => {
				if (index !== sourceIndex && index !== targetIndex) return note;
				const otherId = index === sourceIndex ? ids[targetIndex] : ids[sourceIndex];
				const links = new Set(note.links || []);
				if (isLinked) links.delete(otherId);
				else links.add(otherId);
				return { ...note, id: ids[index], links: [...links] };
			});
		});
	};

	return (
		<>
			{token && (
				<GroupsPanel
					token={token}
					currentUserEmail={user}
					selectedGroupId={selectedGroup?.id}
					isSharedNoteSelected={Boolean(selectedSharedNote)}
					onSelectGroup={selectGroup}
					onSelectSharedNote={selectSharedNote}
				/>
			)}
			<TreeNote
				ChoiceCore={ChoiceCore}
				setChoiceCore={setChoiceCore}
				setSelectedCoreId={setSelectedCoreId}
				RoundCore={RoundCore}
				ColorCore={ColorCore}
				setColorCore={setColorCore}
				setRoundCore={setRoundCore}
				isLinkMode={isLinkMode}
				setIsLinkMode={setIsLinkMode}
				isGroup={Boolean(selectedGroup || selectedSharedNote)}
				isReadOnly={selectedGroup?.role === 'reader' || selectedSharedNote?.role === 'reader'}
			/>
			<CreateNote
				NameCore={NameCore}
				setNameCore={setNameCore}
				BioCore={BioCore}
				setBioCore={setBioCore}
				CreateCore={CreateCore}
				DeleteCore={DeleteCore}
				setCreateCore={setCreateCore}
				setDeleteCore={setDeleteCore}
				AddCore={AddCore}
				editingNoteId={editingNoteId}
				onCancelEdit={cancelEdit}
				onEditNote={editNote}
				Elements={Elements}
				ChoiceCore={ChoiceCore}
				selectedCoreId={selectedCoreId}
				setSelectedCoreId={setSelectedCoreId}
				isAuthenticated={Boolean(token)}
				onDeleteNote={deleteNote}
				selectedGroup={selectedGroup}
				selectedSharedNote={selectedSharedNote}
				canEditNote={canEditNote}
				canDeleteNote={() => !selectedSharedNote && (!selectedGroup || selectedGroup.role === 'owner')}
				canCreateNote={!selectedSharedNote && (!selectedGroup || selectedGroup.role !== 'reader')}
				token={token}
				setSaveStatus={setSaveStatus}
			/>
			<RUser
				setUser={setUser}
				setPassword={setPassword}
				user={user}
				password={password}
				isAuthenticated={Boolean(token)}
				isAdmin={isAdmin}
				token={token}
				onAuthenticated={handleAuthenticated}
				onLogout={handleLogout}
				saveStatus={saveStatus}
			/>
			<AtomIcon
				ChoiceCore={ChoiceCore}
				NameCore={NameCore}
				BioCore={BioCore}
				RoundCore={RoundCore}
				ColorCore={ColorCore}
				CreateCore={CreateCore}
				DeleteCore={DeleteCore}
				Elements={Elements}
				isGroup={Boolean(selectedGroup)}
				isLinkMode={isLinkMode}
				onLinkNotes={linkNotes}
				onMoveNode={moveNode}
				onEditNote={editNote}
			/>
		</>
	);
};

export default MiniApp;
