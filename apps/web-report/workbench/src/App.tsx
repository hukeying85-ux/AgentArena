import { Component, type ComponentChildren } from "preact";
import { Shell } from "./components/Shell";
import { Notice } from "./components/ui";
import { useWorkbench, WorkbenchProvider } from "./hooks/useWorkbench";
import { ComparePage } from "./pages/ComparePage";
import { EnvironmentPage } from "./pages/EnvironmentPage";
import { EvidencePage } from "./pages/EvidencePage";
import { LibraryPage } from "./pages/LibraryPage";
import { LivePage } from "./pages/LivePage";
import { OutcomePage } from "./pages/OutcomePage";
import { PlanPage } from "./pages/PlanPage";
import { RunsPage } from "./pages/RunsPage";
import { SettingsPage } from "./pages/SettingsPage";

class ErrorBoundary extends Component<{ children: ComponentChildren }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("[workbench] page render failed", error); }
  render() {
    if (this.state.error) return <div class="fatal-error"><Notice kind="danger"><strong>Page unavailable</strong><span>{this.state.error.message}</span></Notice><button class="button secondary" type="button" onClick={() => { this.setState({ error: null }); window.location.hash = "/runs"; }}>Return to Runs</button></div>;
    return this.props.children;
  }
}

function CurrentPage() {
  const { page } = useWorkbench();
  if (page === "plan") return <PlanPage/>;
  if (page === "live") return <LivePage/>;
  if (page === "outcome") return <OutcomePage/>;
  if (page === "evidence") return <EvidencePage/>;
  if (page === "compare") return <ComparePage/>;
  if (page === "library") return <LibraryPage/>;
  if (page === "environment") return <EnvironmentPage/>;
  if (page === "settings") return <SettingsPage/>;
  return <RunsPage/>;
}

export function App() {
  return <ErrorBoundary><WorkbenchProvider><Shell><CurrentPage/></Shell></WorkbenchProvider></ErrorBoundary>;
}
