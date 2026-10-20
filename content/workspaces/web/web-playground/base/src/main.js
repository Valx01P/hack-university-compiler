// The page's entry point. index.html loads it with <script type="module">, so it
// can import other files, and Vite reloads the page when you save it.
import { greet } from "./greet.js";

const app = document.querySelector("#app");

const heading = document.createElement("h1");
heading.textContent = greet("web");

const hint = document.createElement("p");
hint.textContent = "Edit src/main.js or src/main.css and save. The page updates by itself.";

app.replaceChildren(heading, hint);
