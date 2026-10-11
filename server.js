import "dotenv/config";
console.log("API Key loaded:", process.env.GEMINI_API_KEY ? "Yes (starts with " + process.env.GEMINI_API_KEY.slice(0, 4) + "...)" : "NO API KEY FOUND!");
import express from "express";
import cors from "cors";
import mvpRoutes from "./routes/mvp.routes.js";
import judgingRoutes from './routes/judging.routes.js';
// import teamworkRoutes from "./routes/teamwork.routes.js"; // enable once the file is written
// import judgingRoutes from "./routes/judging.routes.js";   // enable once the file is written

const app = express();
app.set("view engine", "ejs");
app.use(cors());
app.use(express.json());
app.use(express.static("public"));
// Expose your root 'data' folder to the browser so fetch('/data/fallback-mvp.json') works
app.use('/data', express.static('data'));

app.get("/games", (req, res) => res.render("games"));
app.get("/mvp", (req, res) => res.render("mvp"));
app.get("/judging", (req, res) => res.render("judging")); // <-- Add this line!

app.use("/api/mvp", mvpRoutes);
// app.use("/api/teamwork", teamworkRoutes);
app.use("/api/judging", judgingRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));