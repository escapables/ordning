export function invoke(command, payload = {}) {
  const invokeFn = window.__TAURI__?.core?.invoke;
  if (typeof invokeFn !== "function") {
    throw new Error("Tauri invoke API unavailable");
  }
  return invokeFn(command, payload);
}
