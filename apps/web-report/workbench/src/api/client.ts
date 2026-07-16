const AUTH_KEY = "agentarena-auth-token";

function authToken(): string {
  try {
    return sessionStorage.getItem(AUTH_KEY) ?? "";
  } catch {
    return "";
  }
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const token = authToken();
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch(url, { ...options, headers, cache: "no-store" });
  const raw = await response.text();
  let data: unknown = null;
  if (raw) {
    try { data = JSON.parse(raw); }
    catch { data = { error: raw }; }
  }
  if (!response.ok) {
    const message = data && typeof data === "object" && "error" in data
      ? String((data as { error: unknown }).error)
      : `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return data as T;
}

export function eventStreamUrl(path: string): string {
  const token = authToken();
  const url = new URL(path, window.location.href);
  if (token) url.searchParams.set("token", token);
  return `${url.pathname}${url.search}`;
}
