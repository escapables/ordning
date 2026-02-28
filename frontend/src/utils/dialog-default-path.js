let cachedDefaultPath = null;
let pendingDefaultPath = null;

function invoke(command, payload = {}) {
  const invokeFn = window.__TAURI__?.core?.invoke;
  if (typeof invokeFn !== "function") {
    throw new Error("Tauri invoke API unavailable");
  }
  return invokeFn(command, payload);
}

export async function getDialogDefaultPath() {
  if (cachedDefaultPath !== null) {
    return cachedDefaultPath;
  }

  if (!pendingDefaultPath) {
    pendingDefaultPath = Promise.resolve()
      .then(() => invoke("get_launch_directory"))
      .then((path) => {
        cachedDefaultPath = typeof path === "string" ? path : "";
        return cachedDefaultPath;
      })
      .catch(() => {
        cachedDefaultPath = "";
        return cachedDefaultPath;
      })
      .finally(() => {
        pendingDefaultPath = null;
      });
  }

  return pendingDefaultPath;
}
