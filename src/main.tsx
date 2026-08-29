import { Signal, computed } from "@n3rdw1z4rd/smoke-ui";
import { log } from "./lib/log";
import { rng } from "./lib/rng";

const App = () => {
    const count = new Signal(0);
    const label = computed(() => `Count: ${count.get()}`);

    log('seed:', rng.seed);

    return (
        <div style={{ fontFamily: "sans-serif", padding: "24px" }}>
            <h1>{label}</h1>

            <button onClick={() => count.set(count.get() + 1)}>+1</button>
            <button onClick={() => count.set(count.get() - 1)}>-1</button>
        </div>
    );
};

document.body.append(<App />);
