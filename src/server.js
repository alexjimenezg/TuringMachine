require("dotenv").config();

const express = require("express");
const path = require("path");
const apiRouter = require("./routes/api");

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));
app.use("/api", apiRouter);

app.get("/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`Turing Test app running on http://localhost:${port}`);
});
