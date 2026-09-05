import React, {useRef, useState} from "react";
import RPointer from "../svg/RPointer";
import LPointer from "../svg/Lpointer";
const CreateNote = (props) => {
 const {NameCore,
	 setNameCore,
	 BioCore,
	 setBioCore,
	 setCreateCore,
	 setDeleteCore,
	 AddCore
 } = props;


	const createCore = () => {
		setCreateCore(true);
		setCreateCore(false);

	}
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
			<button
				className={"CreateNewNote"}
				onClick={() => AddCore()}
			>Create new note
			</button>
			<textarea
				className="NameNote"
				placeholder="Enter name note"
				onChange={(e) => setNameCore(e.target.value)}
			/>
			<textarea
				onInput={handleInput}
				className="WriteNote"
				placeholder="Write note"
				onChange={(e) => setBioCore(e.target.value)}

			/>
		</div>
	</>)
}
export default CreateNote