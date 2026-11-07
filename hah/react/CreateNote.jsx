import React, {useEffect, useRef, useState} from "react";
import RPointer from "../svg/RPointer";
import LPointer from "../svg/Lpointer";
import * as Y from "yjs";

const API_URL = 'http://localhost:3000/registretion';

function updateSharedText(sharedText, nextValue) {
	const previousValue = sharedText.toString();
	if (previousValue === nextValue) return;

	let prefix = 0;
	while (
		prefix < previousValue.length
		&& prefix < nextValue.length
		&& previousValue[prefix] === nextValue[prefix]
	) prefix += 1;
	if (prefix > 0 && /[\uD800-\uDBFF]/.test(previousValue[prefix - 1])) prefix -= 1;

	let suffix = 0;
	while (
		suffix < previousValue.length - prefix
		&& suffix < nextValue.length - prefix
		&& previousValue[previousValue.length - suffix - 1] === nextValue[nextValue.length - suffix - 1]
	) suffix += 1;
	if (
		suffix > 0
		&& /[\uDC00-\uDFFF]/.test(previousValue[previousValue.length - suffix])
	) suffix -= 1;

	sharedText.delete(prefix, previousValue.length - prefix - suffix);
	sharedText.insert(prefix, nextValue.slice(prefix, nextValue.length - suffix));
}

const CreateNote = (props) => {
 const {NameCore,
	 setNameCore,
	 BioCore,
	 setBioCore,
	 AddCore,
	 editingNoteId,
	 onCancelEdit,
	 onEditNote,
	 Elements = [],
	 ChoiceCore,
	 selectedCoreId,
	 setSelectedCoreId,
	 isAuthenticated,
	 onDeleteNote,
	 selectedGroup,
	canEditNote = () => true,
	canDeleteNote = canEditNote,
	canCreateNote = true,
	token,
	setSaveStatus,
	selectedSharedNote,
 } = props;
	const [noteError, setNoteError] = useState('');
	const [isSaving, setIsSaving] = useState(false);
	const [collaborators, setCollaborators] = useState([]);
	const [collaborationRole, setCollaborationRole] = useState(null);
	const [hasCollaborationLoaded, setHasCollaborationLoaded] = useState(false);
	const [isAccessRevoked, setIsAccessRevoked] = useState(false);
	const [noteShares, setNoteShares] = useState([]);
	const [shareEmail, setShareEmail] = useState('');
	const [shareRole, setShareRole] = useState('reader');
	const [isSharing, setIsSharing] = useState(false);
	const sharedDocRef = useRef(null);
	const canEditCurrent = selectedGroup
		? ['owner', 'editor'].includes(collaborationRole || selectedGroup.role)
		: !selectedSharedNote || ['owner', 'editor'].includes(collaborationRole || selectedSharedNote.role);

	useEffect(() => {
		if (!editingNoteId || !token) {
			sharedDocRef.current = null;
			setCollaborators([]);
			setCollaborationRole(null);
			setHasCollaborationLoaded(false);
			return undefined;
		}

		const doc = new Y.Doc();
		sharedDocRef.current = doc;
		setHasCollaborationLoaded(false);
		setIsAccessRevoked(false);
		setCollaborationRole(null);
		let socket;
		let retryTimeout;
		let stopped = false;
		let ready = false;
		let pendingSaves = 0;
		const remoteOrigin = Symbol('remote');
		const title = doc.getText('title');
		const body = doc.getText('body');
		const syncInputs = () => {
			setNameCore(title.toString());
			setBioCore(body.toString());
		};
		title.observe(syncInputs);
		body.observe(syncInputs);
		doc.on('update', (update, origin) => {
			if (origin === remoteOrigin) return;
			pendingSaves += 1;
			setSaveStatus?.('Сохранение...');
			if (ready && socket?.readyState === WebSocket.OPEN) socket.send(update);
		});

		const connect = () => {
			if (stopped) return;
			const url = new URL(API_URL);
			url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
			url.pathname = '/collab';
			url.search = '';
			socket = new WebSocket(url);
			socket.binaryType = 'arraybuffer';
			socket.onopen = () => socket.send(JSON.stringify({
				type: 'auth',
				token,
				noteId: editingNoteId,
			}));
			socket.onmessage = async (event) => {
				if (typeof event.data !== 'string') {
					const update = event.data instanceof Blob
						? new Uint8Array(await event.data.arrayBuffer())
						: new Uint8Array(event.data);
					Y.applyUpdate(doc, update, remoteOrigin);
					return;
				}
				let message;
				try {
					message = JSON.parse(event.data);
				} catch {
					setSaveStatus?.('Ошибка синхронизации заметки.');
					return;
				}
				if (message.type === 'ready') {
					ready = true;
					setHasCollaborationLoaded(true);
					setCollaborationRole(message.role);
					setCollaborators(message.participants || []);
					socket.send(JSON.stringify({ type: 'presence' }));
					if (pendingSaves > 0) {
						pendingSaves = 1;
						socket.send(Y.encodeStateAsUpdate(doc));
					}
				} else if (message.type === 'presence') {
					setCollaborators(message.participants || []);
				} else if (message.type === 'saved') {
					pendingSaves = Math.max(0, pendingSaves - 1);
					if (pendingSaves === 0) setSaveStatus?.('Сохранено');
				} else if (message.type === 'error') {
					setSaveStatus?.(`Ошибка синхронизации: ${message.message}`);
				}
			};
			socket.onclose = (event) => {
				ready = false;
				if (event.code === 4403 || event.code === 4401) {
					stopped = true;
					setIsAccessRevoked(true);
					setSaveStatus?.('Доступ к заметке отозван');
					return;
				}
				setSaveStatus?.('Нет соединения');
				if (!stopped) retryTimeout = window.setTimeout(connect, 2000);
			};
			socket.onerror = () => socket.close();
		};
		connect();

		return () => {
			stopped = true;
			window.clearTimeout(retryTimeout);
			ready = false;
			if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
			title.unobserve(syncInputs);
			body.unobserve(syncInputs);
			doc.destroy();
			sharedDocRef.current = null;
			setCollaborators([]);
			setCollaborationRole(null);
			setHasCollaborationLoaded(false);
		};
	}, [editingNoteId, selectedGroup?.id, selectedSharedNote?.id, token]);

	useEffect(() => {
		if (!editingNoteId || selectedGroup || selectedSharedNote || !token) {
			setNoteShares([]);
			return undefined;
		}
		const controller = new AbortController();
		fetch(`${API_URL}/notes/${encodeURIComponent(editingNoteId)}/shares`, {
			headers: { Authorization: `Bearer ${token}` },
			signal: controller.signal,
		})
			.then(async (response) => {
				const data = await response.json();
				if (!response.ok) throw new Error(data.error || 'Не удалось загрузить список доступа.');
				setNoteShares(data.shares);
			})
			.catch((error) => {
				if (error.name !== 'AbortError') setNoteError(error.message);
			});
		return () => controller.abort();
	}, [editingNoteId, selectedGroup?.id, selectedSharedNote?.id, token]);

	const handleTitleChange = (value) => {
		setNameCore(value);
		const title = sharedDocRef.current?.getText('title');
		if (title) {
			sharedDocRef.current.transact(() => updateSharedText(title, value));
		}
	};
	const handleBodyChange = (value) => {
		setBioCore(value);
		const body = sharedDocRef.current?.getText('body');
		if (body) {
			sharedDocRef.current.transact(() => updateSharedText(body, value));
		}
	};
	const addShare = async (event) => {
		event.preventDefault();
		setIsSharing(true);
		setNoteError('');
		try {
			const response = await fetch(`${API_URL}/notes/${encodeURIComponent(editingNoteId)}/shares`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({ email: shareEmail, role: shareRole }),
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || 'Не удалось предоставить доступ.');
			setNoteShares((previous) => [
				...previous.filter((share) => share.email !== data.share.email),
				data.share,
			]);
			setShareEmail('');
		} catch (error) {
			setNoteError(error.message);
		} finally {
			setIsSharing(false);
		}
	};
	const removeShare = async (email) => {
		setIsSharing(true);
		setNoteError('');
		try {
			const response = await fetch(
				`${API_URL}/notes/${encodeURIComponent(editingNoteId)}/shares/${encodeURIComponent(email)}`,
				{ method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
			);
			const data = response.status === 204 ? {} : await response.json();
			if (!response.ok) throw new Error(data.error || 'Не удалось отозвать доступ.');
			setNoteShares((previous) => previous.filter((share) => share.email !== email));
		} catch (error) {
			setNoteError(error.message);
		} finally {
			setIsSharing(false);
		}
	};
	const downloadCopy = () => {
		const copy = new Blob(
			[JSON.stringify({ NameCore, BioCore }, null, 2)],
			{ type: 'application/json' },
		);
		const url = URL.createObjectURL(copy);
		const link = document.createElement('a');
		link.href = url;
		link.download = `${NameCore.trim() || 'note'}.json`;
		link.click();
		URL.revokeObjectURL(url);
	};
	const handleCreate = async () => {
		if (!NameCore.trim() && !BioCore.trim()) {
			setNoteError('Enter a note name or some text.');
			return;
		}
		if (!ChoiceCore && !selectedCoreId && !editingNoteId) {
			setNoteError(Elements.some((note) => note.ChoiceCore)
				? 'Select the core this electron should orbit.'
				: 'Create a core before adding an electron.');
			return;
		}

		setIsSaving(true);
		try {
			const added = await AddCore();
			if (!added) {
				setNoteError(isAuthenticated
					? 'Select an existing core for this electron.'
					: 'Sign in to save your notes.');
				return;
			}
			setNoteError('');
			setNameCore('');
			setBioCore('');
			if (editingNoteId) onCancelEdit();
		} catch (error) {
			setNoteError(error.message || 'Не удалось сохранить заметку.');
		} finally {
			setIsSaving(false);
		}
	};
	const handleInput = (e) => {
		const textarea = e.target;
		const maxHeight = 580;

		textarea.style.height = 'auto';
		textarea.style.height = textarea.scrollHeight + 'px';

		if (textarea.scrollHeight >= maxHeight) {
			textarea.style.overflowY = 'auto';
		} else {
			textarea.style.overflowY = 'hidden';
		}
	};
	const [positionRight, setPositionRight] = useState(false);
	const position = () => {
		setPositionRight(!positionRight);
	}

	return (<>
		<button
			style={{left: positionRight ? "4% " : "30%",
		}}
			className={"ButtonRight"}
			onClick={() => position()}
		>{positionRight ? <LPointer /> : <RPointer />}
		</button>
		<div id="note" style={{left: positionRight ? "-11% " : "15%"}}>
			{selectedGroup && <h2 className="NotesScope">{selectedGroup.name}</h2>}
			{selectedSharedNote && (
				<h2 className="NotesScope">Личная заметка · {selectedSharedNote.ownerEmail}</h2>
			)}
			<button
				className={"CreateNewNote"}
				onClick={handleCreate}
				disabled={!isAuthenticated || isSaving || !canCreateNote || !canEditCurrent}
			>{isSaving ? 'Saving...' : editingNoteId ? 'Save changes' : 'Create new note'}
			</button>
			{editingNoteId && collaborators.length > 0
				&& (selectedGroup || selectedSharedNote || noteShares.length > 0) && (
				<div className="NoteCollaborators" aria-label="Участники в заметке">
					Сейчас в заметке: {[...new Set(collaborators)].join(', ')}
				</div>
			)}
			{editingNoteId && !selectedGroup && !selectedSharedNote && (
				<section className="NoteShareSettings" aria-label="Совместный доступ">
					<strong>Совместный доступ</strong>
					{noteShares.map((share) => (
						<div className="NoteShareRow" key={share.email}>
							<span>{share.email} · {share.role === 'editor' ? 'Редактор' : 'Читатель'}</span>
							<button type="button" disabled={isSharing} onClick={() => removeShare(share.email)}>
								Отозвать
							</button>
						</div>
					))}
					<form className="NoteShareForm" onSubmit={addShare}>
						<input
							type="email"
							value={shareEmail}
							onChange={(event) => setShareEmail(event.target.value)}
							placeholder="Email пользователя"
							required
						/>
						<select value={shareRole} onChange={(event) => setShareRole(event.target.value)}>
							<option value="reader">Читатель</option>
							<option value="editor">Редактор</option>
						</select>
						<button type="submit" disabled={isSharing}>Поделиться</button>
					</form>
				</section>
			)}
			{isAccessRevoked && (
				<button type="button" className="SaveNoteCopy" onClick={downloadCopy}>
					Скачать локальную копию
				</button>
			)}
			<textarea
				className="NameNote"
				placeholder="Enter name note"
				value={NameCore}
				onChange={(e) => handleTitleChange(e.target.value)}
				readOnly={!canEditCurrent || isAccessRevoked || (!editingNoteId && !canCreateNote)
					|| (Boolean(editingNoteId) && !hasCollaborationLoaded)}
			/>
			<textarea
				onInput={handleInput}
				className="WriteNote"
				placeholder="Write note"
				value={BioCore}
				onChange={(e) => handleBodyChange(e.target.value)}
				readOnly={!canEditCurrent || isAccessRevoked || (!editingNoteId && !canCreateNote)
					|| (Boolean(editingNoteId) && !hasCollaborationLoaded)}

			/>
			{!ChoiceCore && (
				<label className="ElectronCoreSelectLabel">
					<span>Electron orbits around</span>
					<select
						className="ElectronCoreSelect"
						value={selectedCoreId}
						onChange={(event) => {
							setSelectedCoreId(event.target.value);
							setNoteError('');
						}}
						required
						disabled={!Elements.some((note) => note.ChoiceCore)}
					>
						<option value="">
							{selectedCoreId ? 'Choose a core' : Elements.some((note) => note.ChoiceCore) ? 'Choose a core' : 'Create a core first'}
						</option>
						{Elements.filter((note) => note.ChoiceCore).map((core, index) => (
							<option key={core.id} value={core.id}>
								{core.NameCore || `Core ${index + 1}`}
							</option>
						))}
					</select>
				</label>
			)}
			{editingNoteId && (
				<button type="button" className="CancelNoteEdit" onClick={onCancelEdit}>
					Cancel editing
				</button>
			)}
			{noteError && <div className="NoteError" role="alert">{noteError}</div>}
			<div className="SavedNotes" aria-label="Saved notes">
				{Elements.map((note, index) => (
					<article className="SavedNote" key={note.id || `${note.NameCore}-${index}`}>
						<div className="SavedNoteHeader">
							{canEditNote(note) ? (
								<button
									type="button"
									className="EditNote"
									onClick={() => onEditNote(index)}
								>
									{note.NameCore || 'Untitled note'}
								</button>
							) : (
								<strong className="EditNoteLabel">{note.NameCore || 'Untitled note'}</strong>
							)}
							{canDeleteNote(note) && (
								<button
									type="button"
									className="DeleteNote"
									onClick={() => onDeleteNote(index)}
									aria-label={`Delete ${note.NameCore || 'note'}`}
								>
									Delete
								</button>
							)}
						</div>
						{note.authorEmail && <div className="NoteAuthor">{note.authorEmail}</div>}
						{note.BioCore && <p>{note.BioCore}</p>}
					</article>
				))}
				{Elements.length === 0 && (
					<div className="EmptyNotes">
						{isAuthenticated ? 'Your saved notes will appear here.' : 'Sign in to save your notes.'}
					</div>
				)}
			</div>
		</div>
	</>)
}
export default CreateNote