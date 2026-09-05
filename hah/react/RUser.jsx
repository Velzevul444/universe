import React, { useState } from "react";
import User from "../svg/User.jsx";
import Logout from "../svg/Logout";

const RUser = (props) => {
   const {setUser, setPassword, user, password, Elements} = props;

	const [showAuth, setShowAuth] = useState(false);
	const autOff = () => {
		setShowAuth(!showAuth);
	};

	const [showLog, setShowLog] = useState(false);
	const logOff = () => {
		setShowLog(!showLog);
	};
	const Universe = () => {
		fetch("http://localhost:3000/registretion/user", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				elemenst: Elements,
			})
		})
			.then(res => res.json())
			.then(data => console.log(data))
			.catch(err => console.log(err));
	}

const logIn = () => {
	fetch("http://localhost:3000/registretion/user", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			username: user,
			password: password,
		})
	})
		.then(res => res.json())
		.then(data => console.log(data))
		.catch(err => console.log(err));
}
	return (
		<div className="rUser">
			<User 	onClick={() => autOff()}	 />
			<Logout onClick={() => Universe()}/>

			{showAuth && (
				<div className="Authorization">
					<div style={{top: showLog ? "7% ": "12%",}} className="Login" onClick={() => logOff()}>Login or</div>
					<div style={{top: showLog ? "7% ": "12%",}} className="Registration" onClick={() => logOff()}>Registration</div>
					<input
						style={{top: showLog ? "30% ": "35%",}}
						className="Email"
						type="Email"
						placeholder="&nbsp;Email"
						onChange={e => setUser(e.target.value)}

					/>
					<input
						style={{top: showLog ? "50% ": "55%",}}
						className="Password"
						type="Password"
						placeholder="&nbsp;Password"
						onChange={e => setPassword(e.target.value)}

					/>
					{showLog && (
						<input
							className="REpassword"
							type="password"
							placeholder="Repeat password"
							onChange={e => setPassword(e.target.value)}
						/>
					)}
					<div style={{top: showLog ? "90% ": "75%",}} className={"ButtonL"} onClick={() => logIn()}>{showLog ? "Registration" : "Login"}</div>

				</div>
			)}
		</div>
	);
};

export default RUser;