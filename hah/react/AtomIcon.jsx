import Atom from './Atom';
import React, {useState} from "react";
import Center from "../svg/Center";

const AtomIcon = (props) => {
  const {NameCore, BioCore, RoundCore, ColorCore, CreateCore, Elements, ChoiceCore
  } = props;
  const choice = () => {
    return Elements.map((el, index) => {
      if (el.ChoiceCore === true) {
        return (
          <Center
            key={index}
            rotation={el.rotation}
            Color={el.ColorCore}

          />
        );
      }

      return (
        <Atom
          key={index}
          rotation={el.rotation}
          Color={el.ColorCore}

        />
      );
    });
  };
  return (<div className={"Atom"}>

      {choice()}
      <div className={"MaimPlace"}>

      </div>
    </div>

  );
};

export default AtomIcon;