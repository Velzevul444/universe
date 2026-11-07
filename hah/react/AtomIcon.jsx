import React, { useEffect, useState } from 'react';

const AtomIcon = (props) => {
	const { Elements, isGroup, isLinkMode, onLinkNotes, onMoveNode, onEditNote } = props;
	const [selectedIndex, setSelectedIndex] = useState(null);
	const [linkMessage, setLinkMessage] = useState('');
	const [graphSize, setGraphSize] = useState({
		width: window.innerWidth,
		height: window.innerHeight,
	});
	const dragRef = React.useRef(null);
	const suppressClickRef = React.useRef(false);
	useEffect(() => {
		const updateGraphSize = () => setGraphSize({
			width: window.innerWidth,
			height: window.innerHeight,
		});
		window.addEventListener('resize', updateGraphSize);
		return () => window.removeEventListener('resize', updateGraphSize);
	}, []);

	const coreIndices = Elements.reduce((indices, note, index) => (
		note.ChoiceCore ? [...indices, index] : indices
	), []);
	const corePositions = new Map(coreIndices.map((index, coreIndex) => {
		const note = Elements[index];
		const angle = -Math.PI / 2 + (coreIndex * 2 * Math.PI) / Math.max(coreIndices.length, 1);
		const radius = coreIndices.length === 1 ? 0 : Math.min(graphSize.width, graphSize.height) * 0.25;
		const defaultPosition = {
			x: 500 + (Math.cos(angle) * radius * 1000) / graphSize.width,
			y: 500 + (Math.sin(angle) * radius * 1000) / graphSize.height,
		};
		return [index, note.positionCustom && note.position ? note.position : defaultPosition];
	}));
	const coreById = new Map(coreIndices.map((index) => [
		Elements[index].id || `legacy-note-${index}`,
		index,
	]));
	const nodes = Elements.map((note, index) => {
		if (note.ChoiceCore) {
			const position = corePositions.get(index);
			return {
				id: note.id || `legacy-note-${index}`,
				x: position.x,
				y: position.y,
				note,
				isCore: true,
				index,
			};
		}

		const parentIndex = coreById.get(note.parentCoreId) ?? coreIndices[0];
		const parentPosition = corePositions.get(parentIndex) || { x: 500, y: 500 };
		const siblings = Elements
			.slice(0, index)
			.filter((sibling) => (
				!sibling.ChoiceCore
				&& (coreById.get(sibling.parentCoreId) ?? coreIndices[0]) === parentIndex
			)).length;
		return {
			id: note.id || `legacy-note-${index}`,
			x: parentPosition.x,
			y: parentPosition.y,
			note,
			isCore: false,
			index,
			parentIndex,
			orbitIndex: siblings,
		};
	});
	const nodesByIndex = new Map(nodes.map((node) => [node.index, node]));
	const nodeIndices = new Map(nodes.map((node, index) => [node.id, index]));
	const links = [];
	const seenLinks = new Set();

	nodes.forEach((node, sourceIndex) => {
		(node.note.links || []).forEach((targetId) => {
			const targetIndex = nodeIndices.get(targetId);
			if (targetIndex === undefined || targetIndex === sourceIndex) return;
			const key = [sourceIndex, targetIndex].sort((a, b) => a - b).join(':');
			if (seenLinks.has(key)) return;
			seenLinks.add(key);
			links.push({
				source: nodes[sourceIndex],
				target: nodes[targetIndex],
				isCoreLink: node.isCore && nodes[targetIndex].isCore,
			});
		});
	});

	useEffect(() => {
		if (!isLinkMode) {
			setSelectedIndex(null);
			setLinkMessage('');
		}
	}, [isLinkMode]);

	const selectNode = (index) => {
		if (!isLinkMode) {
			onEditNote(index);
			return;
		}
		if (selectedIndex === null) {
			setSelectedIndex(index);
			setLinkMessage('Now choose another note to connect.');
			return;
		}
		if (selectedIndex === index) {
			setLinkMessage('Choose a different note.');
			return;
		}

		const firstNote = Elements[selectedIndex];
		const secondId = nodes[index].id;
		const secondNote = Elements[index];
		const isLinked = firstNote.links?.includes(secondId)
			|| secondNote.links?.includes(nodes[selectedIndex].id);
		onLinkNotes(selectedIndex, index);
		setLinkMessage(isLinked ? 'Link removed.' : 'Link created.');
		setSelectedIndex(null);
	};

	const startDrag = (event, index, node) => {
		if (event.button !== 0 || isGroup) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		dragRef.current = {
			pointerId: event.pointerId,
			index: node.isCore ? index : node.parentIndex,
			startX: event.clientX,
			startY: event.clientY,
			nodeX: node.x,
			nodeY: node.y,
			moved: false,
		};
	};

	const moveNode = (event) => {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		const rect = event.currentTarget.closest('.NoteGraph').getBoundingClientRect();
		const nextX = Math.max(20, Math.min(980, drag.nodeX + ((event.clientX - drag.startX) / rect.width) * 1000));
		const nextY = Math.max(20, Math.min(980, drag.nodeY + ((event.clientY - drag.startY) / rect.height) * 1000));
		if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 3) return;
		drag.moved = true;
		suppressClickRef.current = true;
		if (drag.index !== undefined) onMoveNode(drag.index, { x: nextX, y: nextY });
	};

	const endDrag = (event) => {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		dragRef.current = null;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		if (drag.moved) {
			window.setTimeout(() => {
				suppressClickRef.current = false;
			}, 0);
		}
	};

	return (
		<section className="NoteGraph" aria-label="Notes graph">
			<div className="GraphNodesLayer">
				{Elements.length > 1 && (
					<svg className="GraphLinks" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
						{links.map(({ source, target, isCoreLink }) => (
							<line
								key={`${source.id}-${target.id}`}
								className={isCoreLink ? 'GraphCoreLink' : undefined}
								x1={source.x}
								y1={source.y}
								x2={target.x}
								y2={target.y}
								stroke={isCoreLink ? '#ffffff' : source.note.ColorCore || '#8c9eff'}
								vectorEffect="non-scaling-stroke"
							/>
						))}
					</svg>
				)}
				{coreIndices.map((index) => {
					const core = nodesByIndex.get(index);
					const electrons = nodes.filter((node) => !node.isCore && node.parentIndex === index);
					return (
						<React.Fragment key={core.id}>
							<div
								className="GraphAtom"
								style={{ left: `${core.x / 10}%`, top: `${core.y / 10}%` }}
							>
								{electrons.map((electron) => (
									<div
										className="GraphElectronOrbit"
										key={electron.id}
										style={{
											'--orbit-duration': `${6 + (electron.orbitIndex % 4) * 1.5}s`,
											'--orbit-angle': `${(electron.orbitIndex * 45) % 360}deg`,
										}}
									>
										<button
											type="button"
											className={[
												'GraphNode',
												'GraphElectron',
												selectedIndex === electron.index ? 'GraphNodeSelected' : '',
												isLinkMode ? 'GraphNodeLinkable' : '',
											].filter(Boolean).join(' ')}
											style={{ '--node-color': electron.note.ColorCore || '#8c9eff' }}
											aria-label={`Electron: ${electron.note.NameCore || 'Untitled note'}`}
											onPointerDown={(event) => startDrag(event, electron.index, electron)}
											onPointerMove={moveNode}
											onPointerUp={endDrag}
											onPointerCancel={endDrag}
											onClick={() => {
												if (!suppressClickRef.current) selectNode(electron.index);
											}}
										/>
									</div>
								))}
							</div>
							<button
								type="button"
								className={[
									'GraphNode',
									'GraphCore',
									selectedIndex === index ? 'GraphNodeSelected' : '',
									isLinkMode ? 'GraphNodeLinkable' : '',
								].filter(Boolean).join(' ')}
								style={{
									left: `${core.x / 10}%`,
									top: `${core.y / 10}%`,
									'--node-color': core.note.ColorCore || '#8c9eff',
								}}
								aria-label={`Core: ${core.note.NameCore || 'Untitled note'}`}
								onPointerDown={(event) => startDrag(event, index, core)}
								onPointerMove={moveNode}
								onPointerUp={endDrag}
								onPointerCancel={endDrag}
								onClick={() => {
									if (!suppressClickRef.current) selectNode(index);
								}}
							/>
						</React.Fragment>
					);
				})}
				{nodes.filter((node) => !node.isCore && node.parentIndex === undefined).map((node) => (
					<button
						type="button"
						className={`GraphNode GraphElectron ${selectedIndex === node.index ? 'GraphNodeSelected' : ''}`}
						key={node.id}
						style={{
							left: `${node.x / 10}%`,
							top: `${node.y / 10}%`,
							'--node-color': node.note.ColorCore || '#8c9eff',
						}}
						aria-label={`Electron: ${node.note.NameCore || 'Untitled note'}`}
						onPointerDown={(event) => startDrag(event, node.index, node)}
						onPointerMove={moveNode}
						onPointerUp={endDrag}
						onPointerCancel={endDrag}
						onClick={() => {
							if (!suppressClickRef.current) selectNode(node.index);
						}}
					/>
				))}
			</div>
			{isLinkMode && (
				<div className="GraphHint" role="status">
					{linkMessage || 'Choose two notes to link or unlink them.'}
				</div>
			)}
		</section>
	);
};

export default AtomIcon;