import Center from "../svg/Center";
import Orbit from "../svg/Orbit";
import Electron from "../svg/Electron";

const Atom = ({rotation = 0, Color}) => {
	return (
		<div
			className={"Atom "}
			style={{transform: `rotate(${rotation}deg)`,
			}}
		>


			<Orbit />
			<Electron Color={Color} />
		</div>
	)
}
export default Atom;
