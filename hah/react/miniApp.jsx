import React, {useRef, useEffect, useState} from 'react';
import AtomIcon from './AtomIcon.jsx';
import RUser from "./RUser.jsx";
import CreateNote from "./CreateNote.jsx";
import TreeNote from "./TreeNote";
import AllCores from "./test";

const MiniApp = () => {

const [user, setUser] = useState("");
const [password, setPassword] = useState("");


const [NameCore, setNameCore] = React.useState("");
const [BioCore, setBioCore] = React.useState("");
const [RoundCore, setRoundCore] = React.useState(true);
const [ColorCore, setColorCore] = React.useState("");
  const [Elements, setElements] = React.useState([]);

const [CreateCore, setCreateCore] = React.useState(false);
const [DeleteCore, setDeleteCore] = React.useState(false);
  const [ChoiceCore, setChoiceCore] = React.useState(true);
const AddCore =  () => {
  setElements(prev => [...prev, { rotation: prev.length * 60, NameCore: NameCore, ColorCore: ColorCore, BioCore: BioCore, ChoiceCore: ChoiceCore }]);

}

  return (
    <>
      {/*<AllCores Cores={Cores} />*/}
      <TreeNote
        ChoiceCore={ChoiceCore}
        setChoiceCore={setChoiceCore}
        RoundCore={RoundCore}
        ColorCore={ColorCore}
        setColorCore={setColorCore}
        setRoundCore={setRoundCore}

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
        AddCore={AddCore}/>
      <RUser
      setUser={setUser}
      setPassword={setPassword}
      user={user}
      password={password}
      Elements={Elements}
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
      />
    </>
  )
}

export default MiniApp

