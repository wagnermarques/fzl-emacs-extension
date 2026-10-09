/**
 * background.js - FZL Emacs Buku Bookmarks Background Service
 * Handles native messaging, omnibox searching, context menus, and badges.
 * Portable across Chromium and Firefox.
 */

const NATIVE_HOST = "fzl_emacs_buku";
const HTTP_BRIDGE_URL = "http://127.0.0.1:8765";

// Cross-browser compatibility wrapper
const browserAPI = globalThis.browser || globalThis.chrome;

/**
 * Storage helpers
 */
async function getSettings() {
  return new Promise((resolve) => {
    browserAPI.storage.local.get(
      {
        commMode: "auto", // "auto", "native", "http"
        dbPath: "/home/wgn/mnt/ext4/Projects-Srcs/Projects-Srcs-Desktop/fzl-emacs/bookmarks/bookmarks.db",
        bukuBin: "/home/wgn/.local/bin/buku",
        emacsclientBin: "/home/wgn/WORKING/Progsativos/ides/emacs/bin/emacsclient",
        defaultTag: "general",
        quickSaveTag: "staging",
        theme: "auto",
      },
      (items) => resolve(items)
    );
  });
}

/**
 * Native Messaging sender
 */
function sendNativeMessagePromise(host, message) {
  return new Promise((resolve, reject) => {
    try {
      browserAPI.runtime.sendNativeMessage(host, message, (response) => {
        const lastErr = browserAPI.runtime.lastError;
        if (lastErr) {
          reject(new Error(lastErr.message || "Native messaging error"));
        } else if (response) {
          resolve(response);
        } else {
          reject(new Error("No response from native messaging host"));
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * HTTP Bridge sender fallback
 */
async function sendHttpBridge(action, data = {}) {
  const endpointMap = {
    ping: "/api/status",
    status: "/api/status",
    get_bookmarks: "/api/bookmarks",
    search: "/api/bookmarks",
    get_tags: "/api/tags",
    check_url: "/api/check-url",
    is_bookmarked: "/api/check-url",
    add_bookmark: "/api/bookmarks",
    add: "/api/bookmarks",
    add_batch: "/api/batch",
    delete_bookmark: "/api/delete",
    delete: "/api/delete",
    update_bookmark: "/api/update",
    update: "/api/update",
    open_in_emacs: "/api/emacs",
  };

  const endpoint = endpointMap[action] || "/api/status";
  const url = `${HTTP_BRIDGE_URL}${endpoint}`;

  if (action === "get_bookmarks" || action === "search") {
    const params = new URLSearchParams();
    if (data.query) params.append("q", data.query);
    if (data.tag) params.append("tag", data.tag);
    if (data.db_path) params.append("db_path", data.db_path);
    const res = await fetch(`${url}?${params.toString()}`);
    return await res.json();
  }

  if (action === "get_tags") {
    const params = new URLSearchParams();
    if (data.db_path) params.append("db_path", data.db_path);
    const res = await fetch(`${url}?${params.toString()}`);
    return await res.json();
  }

  if (action === "check_url" || action === "is_bookmarked") {
    const params = new URLSearchParams();
    params.append("url", data.url || "");
    if (data.db_path) params.append("db_path", data.db_path);
    const res = await fetch(`${url}?${params.toString()}`);
    return await res.json();
  }

  if (action === "ping" || action === "status") {
    const res = await fetch(url);
    return await res.json();
  }

  // POST for add, batch, delete, update, open_in_emacs
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return await res.json();
}

/**
 * Universal dispatcher
 */
async function dispatchBackend(action, data = {}) {
  const settings = await getSettings();
  const payload = {
    action,
    db_path: settings.dbPath,
    buku_bin: settings.bukuBin,
    emacsclient_bin: settings.emacsclientBin,
    ...data,
  };

  if (settings.commMode === "http") {
    return await sendHttpBridge(action, payload);
  }

  if (settings.commMode === "native") {
    return await sendNativeMessagePromise(NATIVE_HOST, payload);
  }

  // "auto" mode: try native messaging first, fall back to HTTP bridge
  try {
    return await sendNativeMessagePromise(NATIVE_HOST, payload);
  } catch (nativeErr) {
    console.warn("Native messaging unavailable, trying HTTP Bridge:", nativeErr.message);
    try {
      const httpRes = await sendHttpBridge(action, payload);
      httpRes._fallback = "http";
      return httpRes;
    } catch (httpErr) {
      throw new Error(`Both Native Host (${nativeErr.message}) and HTTP Bridge (${httpErr.message}) failed.`);
    }
  }
}

/**
 * Check active tab and update action badge
 */
async function checkActiveTabStatus() {
  try {
    const tabs = await new Promise((resolve) => {
      browserAPI.tabs.query({ active: true, currentWindow: true }, (res) => resolve(res || []));
    });
    if (!tabs || tabs.length === 0 || !tabs[0].url) return;

    const currentTab = tabs[0];
    if (currentTab.url.startsWith("chrome://") || currentTab.url.startsWith("about:")) {
      browserAPI.action.setBadgeText({ text: "", tabId: currentTab.id });
      return;
    }

    const check = await dispatchBackend("check_url", { url: currentTab.url });
    if (check && check.bookmarked) {
      browserAPI.action.setBadgeText({ text: "★", tabId: currentTab.id });
      browserAPI.action.setBadgeBackgroundColor({ color: "#6c5ce7", tabId: currentTab.id });
      browserAPI.action.setTitle({
        title: `FZL Buku: #${check.bookmark.id} [${(check.bookmark.tags || []).join(", ")}]`,
        tabId: currentTab.id,
      });
    } else {
      browserAPI.action.setBadgeText({ text: "", tabId: currentTab.id });
      browserAPI.action.setTitle({ title: "FZL Emacs Buku Bookmarks", tabId: currentTab.id });
    }
  } catch (e) {
    // ignore background errors when host is offline
  }
}

// -----------------------------------------------------------------------------
// Event Listeners: Tabs & Navigation
// -----------------------------------------------------------------------------

browserAPI.tabs.onActivated.addListener(() => {
  checkActiveTabStatus();
});

browserAPI.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    checkActiveTabStatus();
  }
});

// -----------------------------------------------------------------------------
// Context Menus
// -----------------------------------------------------------------------------

function setupContextMenus() {
  browserAPI.contextMenus.removeAll(() => {
    browserAPI.contextMenus.create({
      id: "fzl_add_page",
      title: "Bookmark Page in Emacs Buku",
      contexts: ["page"],
    });

    browserAPI.contextMenus.create({
      id: "fzl_add_link",
      title: "Bookmark Link in Emacs Buku",
      contexts: ["link"],
    });

    browserAPI.contextMenus.create({
      id: "fzl_save_all_tabs",
      title: "Save All Window Tabs to Buku Group...",
      contexts: ["page"],
    });

    browserAPI.contextMenus.create({
      id: "fzl_open_emacs_manager",
      title: "Open Buku Manager in Emacs (*ebuku*)",
      contexts: ["page", "action"],
    });
  });
}

browserAPI.contextMenus.onClicked.addListener(async (info, tab) => {
  const settings = await getSettings();

  if (info.menuItemId === "fzl_add_page") {
    if (!tab || !tab.url) return;
    try {
      const res = await dispatchBackend("add_bookmark", {
        url: tab.url,
        title: tab.title || "",
        tags: settings.defaultTag,
        description: "Added via browser context menu",
      });
      checkActiveTabStatus();
    } catch (e) {
      console.error("Context menu add error:", e);
    }
  } else if (info.menuItemId === "fzl_add_link") {
    if (!info.linkUrl) return;
    try {
      await dispatchBackend("add_bookmark", {
        url: info.linkUrl,
        title: info.selectionText || info.linkUrl,
        tags: settings.defaultTag,
        description: "Link added via browser context menu",
      });
    } catch (e) {
      console.error("Context menu add link error:", e);
    }
  } else if (info.menuItemId === "fzl_save_all_tabs") {
    // Open the popup with batch tab activated
    browserAPI.action.openPopup?.();
  } else if (info.menuItemId === "fzl_open_emacs_manager") {
    try {
      await dispatchBackend("open_in_emacs", { action: "manager" });
    } catch (e) {
      console.error("Open in emacs error:", e);
    }
  }
});

// -----------------------------------------------------------------------------
// Omnibox ('bk <query>')
// -----------------------------------------------------------------------------

browserAPI.omnibox.onInputChanged.addListener(async (text, suggest) => {
  const query = text.trim();
  if (!query) return;

  try {
    const res = await dispatchBackend("get_bookmarks", { query, limit: 6 });
    if (!res || !res.bookmarks) return;

    const suggestions = res.bookmarks.map((bm) => {
      const tagStr = bm.tags && bm.tags.length > 0 ? ` [${bm.tags.join(",")}]` : "";
      // Escape XML characters for omnibox description
      const safeTitle = (bm.title || bm.url).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const safeUrl = bm.url.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return {
        content: bm.url,
        description: `<match>${safeTitle}</match> <dim>${tagStr} - ${safeUrl}</dim>`,
      };
    });

    suggest(suggestions);
  } catch (e) {
    console.warn("Omnibox search error:", e);
  }
});

browserAPI.omnibox.onInputEntered.addListener((text, disposition) => {
  let url = text.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
  }

  if (disposition === "currentTab") {
    browserAPI.tabs.update({ url });
  } else if (disposition === "newForegroundTab") {
    browserAPI.tabs.create({ url, active: true });
  } else if (disposition === "newBackgroundTab") {
    browserAPI.tabs.create({ url, active: false });
  }
});

// -----------------------------------------------------------------------------
// Commands / Shortcuts
// -----------------------------------------------------------------------------

browserAPI.commands.onCommand.addListener(async (command) => {
  if (command === "quick_add_bookmark") {
    const tabs = await new Promise((resolve) => {
      browserAPI.tabs.query({ active: true, currentWindow: true }, (res) => resolve(res || []));
    });
    if (!tabs || tabs.length === 0 || !tabs[0].url) return;
    const tab = tabs[0];
    const settings = await getSettings();

    try {
      await dispatchBackend("add_bookmark", {
        url: tab.url,
        title: tab.title || "",
        tags: settings.quickSaveTag || "quick",
        description: "Saved via keyboard shortcut",
      });
      checkActiveTabStatus();
    } catch (e) {
      console.error("Quick add error:", e);
    }
  }
});

// -----------------------------------------------------------------------------
// Runtime Message Listener (Popup & Options communication)
// -----------------------------------------------------------------------------

browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "DISPATCH_BACKEND") {
    dispatchBackend(request.action, request.data)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }

  if (request.type === "CHECK_ACTIVE_TAB") {
    checkActiveTabStatus().then(() => sendResponse({ success: true }));
    return true;
  }
});

// Initialize on install or startup
browserAPI.runtime.onInstalled.addListener(() => {
  setupContextMenus();
});

browserAPI.runtime.onStartup.addListener(() => {
  setupContextMenus();
  checkActiveTabStatus();
});
