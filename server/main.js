import express from 'express';
import  routers  from './user.controller.js';
import cors from 'cors';


const app = express();

app.use(cors({
  origin: 'http://localhost:4174',
  credentials: true,
}));

async function main() {
	app.use(express.json());
	app.use('/registretion', routers);
	app.listen(3000);
}
main();
