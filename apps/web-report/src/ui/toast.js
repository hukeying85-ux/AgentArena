/**
 * @module toast
 *
 * Global toast notification system.
 *
 * Usage:
 *   import { showToast } from "./ui/toast.js";
 *   showToast("Run complete!", "success");
 *   showToast("Failed to connect", "error", 6000);
 *
 * Types: "info" | "success" | "warning" | "error"
 */

let toastContainer = null;

function ensureContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.className = "toast-container";
    toastContainer.setAttribute("aria-live", "polite");
    toastContainer.setAttribute("aria-atomic", "true");
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

let toastSeq = 0;

export function showToast(message, type = "info", duration = 4000) {
  const container = ensureContainer();
  const toast = document.createElement("div");
  const id = `toast-${++toastSeq}`;
  toast.id = id;
  toast.className = `toast-notification toast-${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");

  // Icon per type
  const iconMap = { success: "✓", error: "✗", warning: "⚠", info: "ℹ" };
  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.textContent = iconMap[type] ?? "";
  icon.style.marginRight = "8px";
  icon.style.flexShrink = "0";

  const text = document.createElement("span");
  text.textContent = message;
  text.style.flex = "1";

  toast.appendChild(icon);
  toast.appendChild(text);
  container.appendChild(toast);

  // Force reflow then animate in
  void toast.offsetWidth;
  requestAnimationFrame(() => toast.classList.add("show"));

  // Auto-dismiss
  let timer = setTimeout(() => dismissToast(toast), duration);

  // Pause on hover
  toast.addEventListener("mouseenter", () => clearTimeout(timer));
  toast.addEventListener("mouseleave", () => {
    timer = setTimeout(() => dismissToast(toast), 1500);
  });

  return id;
}

function dismissToast(toast) {
  if (!toast || toast.dataset.dismissing) return;
  toast.dataset.dismissing = "1";
  toast.classList.remove("show");
  setTimeout(() => toast.remove(), 400);
}

export function dismissToastById(id) {
  const toast = document.getElementById(id);
  if (toast) dismissToast(toast);
}

// Expose to window for legacy inline usage
if (typeof window !== "undefined") {
  window.showToast = showToast;
}
