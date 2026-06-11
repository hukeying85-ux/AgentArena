import { elements } from "./app-elements.js";
import { state } from "./app-state.js";

/**
 * Open or close the mobile sidebar with proper focus management.
 *
 * @param {boolean} open
 */
export function setSidebarOpen(open) {
  state.sidebarOpen = open;
  elements.sidebar.classList.toggle("sidebar-open", open);
  elements.sidebarBackdrop.classList.toggle("active", open);
  elements.sidebarToggle.setAttribute("aria-expanded", String(open));
  if (open) {
    const firstFocusable = /** @type {HTMLElement | null} */ (
      elements.sidebar.querySelector(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
    if (firstFocusable) setTimeout(() => firstFocusable.focus(), 0);
  } else {
    setTimeout(() => elements.sidebarToggle.focus(), 0);
  }
}

/**
 * Wire up sidebar toggle, backdrop click, and Escape key handlers.
 */
export function initSidebar() {
  elements.sidebarToggle.addEventListener("click", () => {
    setSidebarOpen(!state.sidebarOpen);
  });

  elements.sidebarBackdrop.addEventListener("click", () => {
    setSidebarOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.sidebarOpen) {
      event.preventDefault();
      setSidebarOpen(false);
    }
  });
}
