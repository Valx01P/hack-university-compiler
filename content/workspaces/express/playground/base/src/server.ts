// A small Express 5 app to start from. npm run dev runs it and restarts it on every save.
import express from "express";

const app = express();
app.use(express.json());

app.get("/hello", (req, res) => {
  const name = typeof req.query.name === "string" ? req.query.name : "world";
  res.json({ message: `Hello, ${name}!` });
});

// The workspace sets PORT to a free port, the same number inside and outside the container.
const port = Number(process.env.PORT ?? 3000);
app.listen(port, process.env.HOST ?? "0.0.0.0", (err) => {
  if (err) {
    console.error(`Could not listen on port ${port}: ${err.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Listening on http://localhost:${port}`);
});
