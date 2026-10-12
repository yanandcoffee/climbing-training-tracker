// Full client-side mount of every route in jsdom, using jiti (jsx enabled) to
// load the real TSX sources. Catches render-time crashes and infinite loops.
import { JSDOM } from "jsdom";
import { createJiti } from "jiti";

const dom = new JSDOM(
  "<!doctype html><html><body><div id='root'></div></body></html>",
  { url: "http://localhost/", pretendToBeVisual: true },
);
const g = globalThis;
g.window = dom.window;
g.document = dom.window.document;
g.HTMLElement = dom.window.HTMLElement;
g.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
});
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
g.ResizeObserver = RO;
dom.window.ResizeObserver = RO;
g.localStorage = dom.window.localStorage;

const jiti = createJiti(import.meta.url, { jsx: true, moduleCache: true });
const React = (await jiti.import("react")).default;
g.React = React; // jiti's classic JSX transform references a global React
const { act } = await jiti.import("react");
const { createRoot } = await jiti.import("react-dom/client");
const { MemoryRouter } = await jiti.import("react-router-dom");
const App = (await jiti.import("../src/App")).default;

const routes = ["/", "/calendar", "/day/2026-10-12", "/exercises", "/progress", "/settings"];
let failures = 0;

for (const route of routes) {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  try {
    await act(async () => {
      root.render(
        React.createElement(MemoryRouter, { initialEntries: [route] }, React.createElement(App)),
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    const text = (host.textContent ?? "").replace(/\s+/g, " ").trim();
    const ok = text.length > 0 && text !== "Loading…";
    console.log(`  ${ok ? "✓" : "✗"} ${route.padEnd(11)} → ${text.slice(0, 48)}…`);
    if (!ok) failures++;
  } catch (e) {
    console.error(`  ✗ ${route} threw: ${String(e.message).split("\n")[0]}`);
    failures++;
  } finally {
    await act(async () => root.unmount());
  }
}

console.log(failures === 0 ? "\nALL ROUTES RENDER ✅" : `\n${failures} ROUTE(S) FAILED ❌`);
process.exit(failures ? 1 : 0);
