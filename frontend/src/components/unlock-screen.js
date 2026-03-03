import { t } from "../i18n/strings.js";
import { invoke } from "../main/invoke.js";

function focusWhenConnected(element) {
  const schedule = typeof requestAnimationFrame === "function"
    ? requestAnimationFrame
    : (callback) => setTimeout(callback, 0);

  const attemptFocus = () => {
    if (!element.isConnected) {
      schedule(attemptFocus);
      return;
    }
    element.focus();
  };

  schedule(attemptFocus);
}

async function exitApp() {
  const exitFn = window.__TAURI__?.process?.exit;
  if (typeof exitFn === "function") {
    await exitFn(0);
    return;
  }

  if (typeof window.close === "function") {
    window.close();
  }
}

function formatUnlockError(error) {
  const message = String(error);
  if (/invalid password|corrupted encrypted data/i.test(message)) {
    return t("unlockWrongPassword");
  }
  return message;
}

export function createUnlockScreen({ onUnlocked = async () => {} } = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = "unlock-screen";

  const form = document.createElement("form");
  form.className = "unlock-screen__card";

  const icon = document.createElement("div");
  icon.className = "unlock-screen__icon";
  icon.textContent = "🔒";

  const title = document.createElement("h1");
  title.className = "unlock-screen__title";
  title.textContent = t("unlockTitle");

  const message = document.createElement("p");
  message.className = "unlock-screen__message";
  message.textContent = t("unlockMessage");

  const field = document.createElement("label");
  field.className = "unlock-screen__field";

  const fieldLabel = document.createElement("span");
  fieldLabel.className = "unlock-screen__label";
  fieldLabel.textContent = t("unlockPasswordLabel");

  const passwordInput = document.createElement("input");
  passwordInput.type = "password";
  passwordInput.className = "unlock-screen__input";
  passwordInput.autocomplete = "current-password";

  const submitButton = document.createElement("button");
  submitButton.type = "submit";
  submitButton.className = "unlock-screen__submit";
  submitButton.textContent = t("unlockButton");

  const error = document.createElement("p");
  error.className = "unlock-screen__error";
  error.hidden = true;

  const quitButton = document.createElement("button");
  quitButton.type = "button";
  quitButton.className = "unlock-screen__quit";
  quitButton.textContent = t("unlockQuit");

  const clearError = () => {
    error.hidden = true;
    error.textContent = "";
  };

  const showError = (messageText) => {
    error.hidden = false;
    error.textContent = messageText;
  };

  passwordInput.addEventListener("input", () => {
    clearError();
  });

  quitButton.addEventListener("click", () => {
    void exitApp();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError();
    submitButton.disabled = true;

    try {
      const settings = await invoke("unlock_encrypted_data", {
        password: passwordInput.value
      });
      await onUnlocked(settings);
    } catch (unlockError) {
      showError(formatUnlockError(unlockError));
    } finally {
      submitButton.disabled = false;
    }
  });

  field.append(fieldLabel, passwordInput);
  form.append(icon, title, message, field, submitButton, error, quitButton);
  wrapper.appendChild(form);

  focusWhenConnected(passwordInput);

  return {
    element: wrapper
  };
}
