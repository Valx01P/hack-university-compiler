// Your component. Open as playground on the /react page copies that page's App.tsx over this
// file; otherwise it starts here. Edit it, add files next to it, or try ideas in src/scratch/.
// Saving keeps the count below: Fast Refresh swaps the component without losing its state.
import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <main className="app">
      <h1>Edit src/App.tsx</h1>
      <p>Save the file and the page updates at once, keeping the count.</p>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        Clicked {count} {count === 1 ? "time" : "times"}
      </button>
      <h2>Things to try</h2>
      <ul>
        <li>
          Fetch the API&apos;s items from <code>/v1/items</code> (see requests.http for every route).
        </li>
        <li>
          Add a component in <code>src/scratch/</code> and import it here.
        </li>
        <li>
          Run <code>npm test</code> in the terminal and change <code>App.test.tsx</code>.
        </li>
      </ul>
    </main>
  );
}
