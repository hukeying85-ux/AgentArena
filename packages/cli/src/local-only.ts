const LOCAL_UI_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "::ffff:127.0.0.1"]);

/** Returns whether a UI host is restricted to this machine. */
export function isLocalUiHost(host: string): boolean {
  return LOCAL_UI_HOSTS.has(host);
}



/** Build a valid local HTTP origin, including brackets required by IPv6 URLs. */
export function formatLocalUiOrigin(host: string, port: number): string {
  const urlHost = host.includes(":") ? `[${host}]` : host;
  return `http://${urlHost}:${port}`;
}
