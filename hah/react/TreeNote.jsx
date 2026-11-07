import React, {useState} from "react";
import LPointer from "../svg/Lpointer";
import RPointer from "../svg/RPointer";
const TreeNote = (props) => {
	const {
		RoundCore,
		setRoundCore,
		ColorCore,
		setColorCore,
		setChoiceCore,
		setSelectedCoreId,
		ChoiceCore,
		isLinkMode,
		setIsLinkMode,
		isGroup,
		isReadOnly,
	} = props;
	const choice = () => {
		setChoiceCore(!ChoiceCore);
		setSelectedCoreId('');
	}

	const [PutColor, setPutColor] = useState(false);
	const Color = () => {
		setPutColor(!PutColor);
	}
	const [positionRight, setPositionRight] = useState(false);
	const position = () => {
		setPositionRight(!positionRight);
	}

	return (<>
			<button
				style={{
					left: positionRight  ? "96% ": "70%",
					}}
			  className={"ButtonRight"}
				onClick={() => position()}>
			{positionRight ? <RPointer /> : <LPointer />}<
				/button>
		<div style={{left: positionRight  ? "111% ": "85%"}} className="treeNote">
			<button
				type="button"
				style={{ border: ChoiceCore ? "2px solid white" : "none" }}
				className="NewCore"
				disabled={isReadOnly}
				onClick={choice}
			>
				New core
			</button>
			<button
				type="button"
				style={{ border: ChoiceCore ? "none" : "2px solid white" }}
				className="NewElectron"
				disabled={isReadOnly}
				onClick={choice}
			>
				New electron
			</button>
			<button
				type="button"
				className={`NewBond ${isLinkMode ? 'BondSelected' : ''}`}
				aria-pressed={isLinkMode}
				disabled={isGroup || isReadOnly}
				onClick={() => setIsLinkMode(!isLinkMode)}
			>
				{isLinkMode ? 'Cancel linking' : 'Link notes'}
			</button>
			<button type="button" className="SetColor" disabled={isReadOnly} onClick={Color}>
				Set color for selected note
			</button>
			{PutColor && (
				<input
					type="color"
					className="PutColor"
					value={ColorCore || '#8c9eff'}
					onChange={(e) => setColorCore(e.target.value)}
					disabled={isReadOnly}
					aria-label="Choose note color"
				/>
			)}
		</div></>
	)
}
export default TreeNote;