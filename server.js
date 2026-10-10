import "dotenv/config";
import express from "express";
import cors from "cors";
import challengesRouter from "./routes/games.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use("/api", challengesRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));