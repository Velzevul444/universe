import {Router} from "express";
import {passwordService, userService, universeService} from "./user.service.js";
const routers = Router();

const UserService = new userService();
routers.post('/user',(req, res) => {
	console.log('incoming body:', req.body);
  console.log('username:', req.body.username);
  console.log('password:', req.body.password);
	console.log('universe :', req.body.universe);

	const user = UserService.createUser(req.body);
	const password = passwordService.createPassword(req.body);
	res.status(201).json({
 	user: req.body.username,
 	password: req.body.password,
});
	const universe = universeService.createUniverse(req.body);
	res.status(201).json({
		universe: req.body.universe,
	})
});
export default routers;