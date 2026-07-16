import { render } from "preact";
import { App } from "./App";
import "./styles.css";

performance.mark("agentarena-workbench-start");
const root = document.getElementById("app");
if (!root) throw new Error("Workbench root element is missing.");
render(<App/>, root);
requestAnimationFrame(() => performance.mark("agentarena-workbench-ready"));
