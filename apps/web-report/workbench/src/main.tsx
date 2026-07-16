import { render } from "preact";
import { App } from "./App";
import "./styles.css";

performance.mark("agentarena-workbench-start");
const root = document.getElementById("app");
if (!root) throw new Error("Workbench root element is missing.");
render(<App/>, root);
requestAnimationFrame(() => performance.mark("agentarena-workbench-ready"));

// Register the offline service worker. Kept in the module entry (not an inline
// script in index.html) so it survives the nonce-based CSP the CLI injects for
// localhost: inline scripts are blocked, but module scripts served from 'self' are allowed.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // Only reload on controllerchange when WE triggered a skip-waiting because a
    // newer SW was found. The very first install also fires controllerchange
    // (via clients.claim), but reloading then aborts in-flight /api/* requests
    // and causes a first-paint flash — the page is already controlled by the
    // new worker, so there is nothing to refresh.
    let pendingSkip = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!pendingSkip) return;
      pendingSkip = false;
      window.location.reload();
    });
    navigator.serviceWorker.register("./sw.js").then((registration) => {
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (worker) {
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              pendingSkip = true;
              worker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        }
      });
    }).catch(() => {});
  });
}
