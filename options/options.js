/**
 * options.js - Settings & Diagnostics Controller
 * Portable across Chromium and Firefox.
 */

const browserAPI = globalThis.browser || globalThis.chrome;

const DEFAULT_DB_PATH = "/home/wgn/mnt/ext4/Projects-Srcs/Projects-Srcs-Desktop/fzl-emacs/bookmarks/bookmarks.db";
const DEFAULT_BUKU_BIN = "/home/wgn/.local/bin/buku";
const DEFAULT_EMACSCLIENT_BIN = "/home/wgn/WORKING/Progsativos/ides/emacs/bin/emacsclient";

// Form Elements
const dbPath = document.getElementById("dbPath");
const btnResetDb = document.getElementById("btnResetDb");
const bukuBin = document.getElementById("bukuBin");
const emacsclientBin = document.getElementById("emacsclientBin");
const commMode = document.getElementById("commMode");
const defaultTag = document.getElementById("defaultTag");
const quickSaveTag = document.getElementById("quickSaveTag");
const themeSelect = document.getElementById("themeSelect");

// Buttons & Feedback
const btnSaveTop = document.getElementById("btnSaveTop");
const btnSaveBottom = document.getElementById("btnSaveBottom");
const btnRunDiagnostics = document.getElementById("btnRunDiagnostics");
const diagnosticsOutput = document.getElementById("diagnosticsOutput");
const statusToast = document.getElementById("statusToast");

function showToast(message, type = "success") {
  statusToast.className = `toast ${type}`;
  statusToast.textContent = message;
  statusToast.classList.remove("hidden");
  setTimeout(() => {
    statusToast.classList.add("hidden");
  }, 3500);
}

function loadSettings() {
  browserAPI.storage.local.get(
    {
      dbPath: DEFAULT_DB_PATH,
      bukuBin: DEFAULT_BUKU_BIN,
      emacsclientBin: DEFAULT_EMACSCLIENT_BIN,
      commMode: "auto",
      defaultTag: "general",
      quickSaveTag: "staging",
      theme: "dark",
    },
    (items) => {
      dbPath.value = items.dbPath;
      bukuBin.value = items.bukuBin;
      emacsclientBin.value = items.emacsclientBin;
      commMode.value = items.commMode;
      defaultTag.value = items.defaultTag;
      quickSaveTag.value = items.quickSaveTag;
      themeSelect.value = items.theme;

      applyTheme(items.theme);
    }
  );
}

function applyTheme(theme) {
  if (theme === "light") {
    document.body.className = "theme-light";
  } else {
    document.body.className = "theme-dark";
  }
}

function saveSettings() {
  const newSettings = {
    dbPath: dbPath.value.trim() || DEFAULT_DB_PATH,
    bukuBin: bukuBin.value.trim() || DEFAULT_BUKU_BIN,
    emacsclientBin: emacsclientBin.value.trim() || DEFAULT_EMACSCLIENT_BIN,
    commMode: commMode.value,
    defaultTag: defaultTag.value.trim() || "general",
    quickSaveTag: quickSaveTag.value.trim() || "staging",
    theme: themeSelect.value,
  };

  browserAPI.storage.local.set(newSettings, () => {
    applyTheme(newSettings.theme);
    showToast("✓ Preferences saved successfully!", "success");
  });
}

function sendToBackend(action, data = {}) {
  return new Promise((resolve, reject) => {
    browserAPI.runtime.sendMessage(
      { type: "DISPATCH_BACKEND", action, data },
      (response) => {
        const err = browserAPI.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
        } else if (response && response.error && !response.success) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      }
    );
  });
}

async function runDiagnostics() {
  diagnosticsOutput.innerHTML = `<p class="diag-placeholder">Running self-test diagnostics...</p>`;
  btnRunDiagnostics.disabled = true;

  try {
    const res = await sendToBackend("ping", {
      db_path: dbPath.value.trim(),
      buku_bin: bukuBin.value.trim(),
      emacsclient_bin: emacsclientBin.value.trim(),
    });

    diagnosticsOutput.innerHTML = "";

    // Item 1: Backend Driver
    const mode = res._fallback ? "Local HTTP Bridge (Fallback)" : "Native Messaging Host";
    diagnosticsOutput.appendChild(createDiagItem("Backend Driver", mode, "ok"));

    // Item 2: Database
    if (res.db_exists) {
      diagnosticsOutput.appendChild(
        createDiagItem(
          `SQLite Database (${res.total_bookmarks} bookmarks, ${res.total_tags} tags)`,
          res.db_path,
          "ok"
        )
      );
    } else {
      diagnosticsOutput.appendChild(
        createDiagItem("SQLite Database", `Not found at: ${res.db_path}`, "err")
      );
    }

    // Item 3: Buku CLI
    if (res.buku_available) {
      diagnosticsOutput.appendChild(
        createDiagItem("Buku CLI Executable", res.buku_bin, "ok")
      );
    } else {
      diagnosticsOutput.appendChild(
        createDiagItem("Buku CLI Executable", `Not found: ${res.buku_bin}`, "err")
      );
    }

    // Item 4: Emacs Server
    if (res.emacs_server_active) {
      diagnosticsOutput.appendChild(
        createDiagItem("Emacs Server (emacsclient)", "Connected & Active", "ok")
      );
    } else {
      diagnosticsOutput.appendChild(
        createDiagItem(
          "Emacs Server (emacsclient)",
          "Offline (Run 'M-x server-start' in Emacs to connect)",
          "warn"
        )
      );
    }

    showToast("Diagnostics completed!", "success");
  } catch (err) {
    diagnosticsOutput.innerHTML = `
      <div class="diag-item">
        <span>Backend Status</span>
        <span class="diag-status err">Failed</span>
      </div>
      <p style="margin-top: 8px; color: var(--danger);">${err.message}</p>
    `;
    showToast("Diagnostics failed: " + err.message, "error");
  } finally {
    btnRunDiagnostics.disabled = false;
  }
}

function createDiagItem(label, value, statusClass) {
  const item = document.createElement("div");
  item.className = "diag-item";

  const labelSpan = document.createElement("span");
  labelSpan.textContent = label;

  const valueSpan = document.createElement("span");
  valueSpan.className = `diag-status ${statusClass}`;
  valueSpan.textContent = value;
  valueSpan.title = value;

  item.appendChild(labelSpan);
  item.appendChild(valueSpan);
  return item;
}

// Event Listeners
btnResetDb.addEventListener("click", () => {
  dbPath.value = DEFAULT_DB_PATH;
  showToast("Reset DB path to fzl-emacs default", "success");
});

btnSaveTop.addEventListener("click", saveSettings);
btnSaveBottom.addEventListener("click", saveSettings);
btnRunDiagnostics.addEventListener("click", runDiagnostics);

themeSelect.addEventListener("change", () => {
  applyTheme(themeSelect.value);
});

document.addEventListener("DOMContentLoaded", loadSettings);
