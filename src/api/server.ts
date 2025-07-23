import express, { Request, Response } from "express";
import http from "http";
import drawRouter from "./routes/draw.js";
import feesRouter from "./routes/fees.js";
import { webSocketService } from "../services/websocketService.js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const server = http.createServer(app);

const port = process.env.PORT || 8080;

app.use(express.json());
app.use(drawRouter);
app.use(feesRouter);

app.get("/", (_req: Request, res: Response) => {
  res.send("Hello, world!");
});

webSocketService.initialize(server);

server.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});
