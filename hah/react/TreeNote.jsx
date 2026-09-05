import React, {useState} from "react";
import LPointer from "../svg/Lpointer";
import RPointer from "../svg/RPointer";
const TreeNote = (props) => {
	const {RoundCore, setRoundCore, ColorCore, setColorCore, setChoiceCore,ChoiceCore} = props;
	const choice = () => {
		setChoiceCore(!ChoiceCore);
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
			<div style={{ border: ChoiceCore ? "2px solid white" : "none" }} className={"NewCore"} onClick={() => choice()}>New core</div>
			<div style={{ border: ChoiceCore ? "none" : "2px solid white" }} className={"NewElectron"} onClick={() => choice()}>New electron</div>
			<div className={"NewBond"}>Bond notes</div>
			<div className={"SetColor"} onClick={() => Color()}>Set color to note </div>
			{PutColor && (
				<input type={"color"} className={"PutColor"} onChange={(e) => setColorCore(e.target.value)} />
			)}
		</div></>
	)
}
export default TreeNote;