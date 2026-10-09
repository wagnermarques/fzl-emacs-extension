/**
 * popup.js - Interactive UI controller for FZL Emacs Buku Extension
 * Portable between Chromium and Firefox.
 */

const browserAPI = globalThis.browser || globalThis.chrome;

// State
let allBookmarks = [];
let allTags = [];
let currentFilterTag = "all";
let currentTabInfo = null;
let systemStatus = null;

// DOM Elements
const toastBar = document.getElementById("toastBar");
const footerStatus = document.getElementById("footerStatus");
const bookmarkTotalBadge = document.getElementById("bookmarkTotalBadge");
const emacsStatusBadge = document.getElementById("emacsStatusBadge");
const btnSettings = document.getElementById("btnSettings");
const linkReload = document.getElementById("linkReload");

// Tab 1 Elements
const addBookmarkForm = document.getElementById("addBookmarkForm");
const pageTitle = document.getElementById("pageTitle");
const pageUrl = document.getElementById("pageUrl");
const pageTags = document.getElementById("pageTags");
const pageComment = document.getElementById("pageComment");
const btnSaveBookmark = document.getElementById("btnSaveBookmark");
const btnSaveText = document.getElementById("btnSaveText");
const btnAddViaEmacs = document.getElementById("btnAddViaEmacs");
const alreadyBookmarkedAlert = document.getElementById("alreadyBookmarkedAlert");
const existingIndex = document.getElementById("existingIndex");
const existingTagsText = document.getElementById("existingTagsText");
const quickTagsChips = document.getElementById("quickTagsChips");
const tagsAutocompleteList = document.getElementById("tagsAutocompleteList");

// Tab 2 Elements
const searchBox = document.getElementById("searchBox");
const btnClearSearch = document.getElementById("btnClearSearch");
const tagsFilterCarousel = document.getElementById("tagsFilterCarousel");
const openAllBar = document.getElementById("openAllBar");
const openAllCountText = document.getElementById("openAllCountText");
const btnOpenAllInTag = document.getElementById("btnOpenAllInTag");
const bookmarksList = document.getElementById("bookmarksList");

// Tab 3 Elements
const tabsList = document.getElementById("tabsList");
const batchTagInput = document.getElementById("batchTagInput");
const batchSelectedCount = document.getElementById("batchSelectedCount");
const batchTotalCount = document.getElementById("batchTotalCount");
const btnBatchSelectAll = document.getElementById("btnBatchSelectAll");
const btnBatchDeselectAll = document.getElementById("btnBatchDeselectAll");
const btnSaveBatchTabs = document.getElementById("btnSaveBatchTabs");

// Tab 4 Elements
const hubEmacsStatusBadge = document.getElementById("hubEmacsStatusBadge");
const hubDbPath = document.getElementById("hubDbPath");
const hubTotalBookmarks = document.getElementById("hubTotalBookmarks");
const hubBackendMode = document.getElementById("hubBackendMode");

// -----------------------------------------------------------------------------
// Messaging Helper
// -----------------------------------------------------------------------------

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

function showToast(message, type = "info", duration = 3000) {
  toastBar.className = `toast-bar ${type}`;
  toastBar.textContent = message;
  toastBar.classList.remove("hidden");
  setTimeout(() => {
    toastBar.classList.add("hidden");
  }, duration);
}

// -----------------------------------------------------------------------------
// Navigation Tabs
// -----------------------------------------------------------------------------

function setupTabNavigation() {
  const tabs = document.querySelectorAll(".nav-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));

      tab.classList.add("active");
      const targetId = tab.getAttribute("data-tab");
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) {
        targetPanel.classList.add("active");
      }

      if (targetId === "tabBatch") {
        loadWindowTabs();
      } else if (targetId === "tabSearch") {
        setTimeout(() => searchBox.focus(), 100);
      }
    });
  });
}

// -----------------------------------------------------------------------------
// Initialization & Status
// -----------------------------------------------------------------------------

async function init() {
  setupTabNavigation();
  setupEventListeners();

  // Load theme preference
  browserAPI.storage.local.get({ theme: "dark" }, (items) => {
    if (items.theme === "light") {
      document.body.className = "theme-light";
    } else {
      document.body.className = "theme-dark";
    }
  });

  // Step 1: Check status
  await refreshStatus();

  // Step 2: Load current tab into Tab 1
  await loadCurrentTab();

  // Step 3: Load bookmarks & tags
  await loadBookmarks();
  await loadTags();
}

async function refreshStatus() {
  try {
    footerStatus.textContent = "Connecting to Buku backend...";
    const status = await sendToBackend("ping");
    systemStatus = status;

    // Update Header & Hub Emacs Status
    if (status.emacs_server_active) {
      emacsStatusBadge.className = "status-badge online";
      emacsStatusBadge.title = "Emacs server: Connected & ready for commands";
      hubEmacsStatusBadge.className = "badge online";
      hubEmacsStatusBadge.textContent = "Online";
    } else {
      emacsStatusBadge.className = "status-badge offline";
      emacsStatusBadge.title = "Emacs server offline. (Start with 'M-x server-start' in Emacs)";
      hubEmacsStatusBadge.className = "badge offline";
      hubEmacsStatusBadge.textContent = "Offline (M-x server-start)";
    }

    // Hub Details
    hubDbPath.textContent = status.db_path || "Default";
    hubDbPath.title = status.db_path || "";
    hubTotalBookmarks.textContent = status.total_bookmarks || 0;
    hubBackendMode.textContent = status._fallback ? "Local HTTP Bridge" : "Native Messaging";

    bookmarkTotalBadge.textContent = status.total_bookmarks || 0;
    footerStatus.textContent = `● Buku: ${status.total_bookmarks} bookmarks (${status.total_tags} tags)`;
  } catch (err) {
    footerStatus.textContent = "⚠ Disconnected from Buku backend";
    showToast("Backend connection failed: " + err.message, "error", 4000);
  }
}

// -----------------------------------------------------------------------------
// Tab 1: Current Page Add / Update
// -----------------------------------------------------------------------------

async function loadCurrentTab() {
  try {
    const tabs = await new Promise((resolve) => {
      browserAPI.tabs.query({ active: true, currentWindow: true }, (res) => resolve(res || []));
    });
    if (!tabs || tabs.length === 0) return;

    currentTabInfo = tabs[0];
    pageTitle.value = currentTabInfo.title || "";
    pageUrl.value = currentTabInfo.url || "";

    // Check if already bookmarked
    if (currentTabInfo.url && !currentTabInfo.url.startsWith("chrome://")) {
      const check = await sendToBackend("check_url", { url: currentTabInfo.url });
      if (check && check.bookmarked && check.bookmark) {
        const bm = check.bookmark;
        alreadyBookmarkedAlert.classList.remove("hidden");
        existingIndex.textContent = `#${bm.id}`;
        existingTagsText.textContent = `Tags: ${(bm.tags || []).join(", ") || "none"}`;
        btnSaveText.textContent = "Update / Append Tags";
        if (bm.description) pageComment.value = bm.description;
        if (bm.tags && bm.tags.length > 0) {
          pageTags.value = bm.tags.join(", ") + ", ";
        }
      } else {
        alreadyBookmarkedAlert.classList.add("hidden");
        btnSaveText.textContent = "Save to Buku";
      }
    }
  } catch (e) {
    console.warn("Failed to load current tab:", e);
  }
}

async function handleSaveBookmark(e) {
  e.preventDefault();
  const url = pageUrl.value.trim();
  const title = pageTitle.value.trim();
  const tags = pageTags.value.trim();
  const comment = pageComment.value.trim();

  if (!url) {
    showToast("URL is required!", "error");
    return;
  }

  btnSaveBookmark.disabled = true;
  btnSaveText.textContent = "Saving...";

  try {
    const res = await sendToBackend("add_bookmark", {
      url,
      title,
      tags,
      description: comment,
    });

    if (res.action === "updated") {
      showToast(res.message || "Bookmark updated!", "success");
    } else {
      showToast("Bookmark added to Buku!", "success");
    }

    // Refresh active tab badge and bookmarks
    browserAPI.runtime.sendMessage({ type: "CHECK_ACTIVE_TAB" });
    await loadBookmarks();
    await loadTags();
    await loadCurrentTab();
  } catch (err) {
    showToast("Error: " + err.message, "error");
  } finally {
    btnSaveBookmark.disabled = false;
    btnSaveText.textContent = "Save to Buku";
  }
}

// -----------------------------------------------------------------------------
// Tags & Autocomplete
// -----------------------------------------------------------------------------

async function loadTags() {
  try {
    const res = await sendToBackend("get_tags");
    if (res && res.tags) {
      allTags = res.tags;
      renderQuickTags(allTags);
      renderTagsCarousel(allTags);
    }
  } catch (e) {
    console.warn("Failed to load tags:", e);
  }
}

function renderQuickTags(tags) {
  quickTagsChips.innerHTML = "";
  const popular = tags.slice(0, 8); // Top 8 most frequent tags
  if (popular.length === 0) {
    ["dev", "emacs", "ia", "linux", "projetos"].forEach((t) => {
      popular.push({ name: t, count: 0 });
    });
  }

  popular.forEach((tagItem) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "tag-chip";
    chip.textContent = `+${tagItem.name}`;
    chip.addEventListener("click", () => {
      appendTagToInput(pageTags, tagItem.name);
    });
    quickTagsChips.appendChild(chip);
  });
}

function appendTagToInput(inputElem, tag) {
  const current = inputElem.value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!current.includes(tag)) {
    current.push(tag);
  }
  inputElem.value = current.join(", ") + ", ";
  inputElem.focus();
}

function setupTagsAutocomplete() {
  pageTags.addEventListener("input", () => {
    const parts = pageTags.value.split(",");
    const query = parts[parts.length - 1].trim().toLowerCase();

    if (!query) {
      tagsAutocompleteList.classList.add("hidden");
      return;
    }

    const matches = allTags.filter((t) => t.name.toLowerCase().startsWith(query)).slice(0, 6);

    if (matches.length === 0) {
      tagsAutocompleteList.classList.add("hidden");
      return;
    }

    tagsAutocompleteList.innerHTML = "";
    matches.forEach((m) => {
      const item = document.createElement("div");
      item.className = "autocomplete-item";
      item.innerHTML = `<span><strong>${m.name}</strong></span> <span style="opacity:0.6">${m.count}</span>`;
      item.addEventListener("click", () => {
        parts[parts.length - 1] = " " + m.name;
        pageTags.value = parts.map((s) => s.trim()).filter(Boolean).join(", ") + ", ";
        tagsAutocompleteList.classList.add("hidden");
        pageTags.focus();
      });
      tagsAutocompleteList.appendChild(item);
    });

    tagsAutocompleteList.classList.remove("hidden");
  });

  document.addEventListener("click", (e) => {
    if (!pageTags.contains(e.target) && !tagsAutocompleteList.contains(e.target)) {
      tagsAutocompleteList.classList.add("hidden");
    }
  });
}

// -----------------------------------------------------------------------------
// Tab 2: Search & Open Bookmarks
// -----------------------------------------------------------------------------

async function loadBookmarks(query = "") {
  try {
    const res = await sendToBackend("get_bookmarks", {
      query,
      tag: currentFilterTag,
      limit: 500,
    });
    if (res && res.bookmarks) {
      allBookmarks = res.bookmarks;
      renderBookmarksList(allBookmarks);
      updateOpenAllBar();
    }
  } catch (err) {
    bookmarksList.innerHTML = `<div class="empty-state">Error loading bookmarks: ${err.message}</div>`;
  }
}

function renderTagsCarousel(tags) {
  tagsFilterCarousel.innerHTML = "";

  // 'All' pill
  const allPill = document.createElement("button");
  allPill.className = `tag-pill ${currentFilterTag === "all" ? "active" : ""}`;
  allPill.textContent = "All";
  allPill.addEventListener("click", () => setTagFilter("all"));
  tagsFilterCarousel.appendChild(allPill);

  // Each tag pill
  tags.forEach((t) => {
    const pill = document.createElement("button");
    pill.className = `tag-pill ${currentFilterTag === t.name ? "active" : ""}`;
    pill.textContent = `${t.name} (${t.count})`;
    pill.addEventListener("click", () => setTagFilter(t.name));
    tagsFilterCarousel.appendChild(pill);
  });
}

function setTagFilter(tag) {
  currentFilterTag = tag;
  document.querySelectorAll(".tag-pill").forEach((p) => p.classList.remove("active"));
  const activePill = Array.from(document.querySelectorAll(".tag-pill")).find(
    (p) => p.textContent.startsWith(tag) || (tag === "all" && p.textContent === "All")
  );
  if (activePill) activePill.classList.add("active");

  loadBookmarks(searchBox.value.trim());
}

function updateOpenAllBar() {
  if (currentFilterTag !== "all" && allBookmarks.length > 0) {
    openAllBar.classList.remove("hidden");
    openAllCountText.textContent = `${allBookmarks.length} bookmark${allBookmarks.length === 1 ? "" : "s"} in '${currentFilterTag}'`;
  } else {
    openAllBar.classList.add("hidden");
  }
}

function renderBookmarksList(bookmarks) {
  if (!bookmarks || bookmarks.length === 0) {
    bookmarksList.innerHTML = `<div class="empty-state">No bookmarks found.</div>`;
    return;
  }

  bookmarksList.innerHTML = "";
  bookmarks.forEach((bm) => {
    const card = document.createElement("div");
    card.className = "bookmark-card";

    // Card Header
    const header = document.createElement("div");
    header.className = "bm-header";

    const titleLink = document.createElement("a");
    titleLink.className = "bm-title-link";
    titleLink.textContent = bm.title || bm.url;
    titleLink.href = bm.url;
    titleLink.title = bm.url;
    titleLink.addEventListener("click", (e) => {
      e.preventDefault();
      browserAPI.tabs.create({ url: bm.url, active: !e.shiftKey });
    });

    const indexBadge = document.createElement("span");
    indexBadge.className = "bm-index";
    indexBadge.textContent = `#${bm.id}`;

    header.appendChild(titleLink);
    header.appendChild(indexBadge);
    card.appendChild(header);

    // URL link
    const urlElem = document.createElement("a");
    urlElem.className = "bm-url truncate";
    urlElem.textContent = bm.url;
    urlElem.href = bm.url;
    urlElem.addEventListener("click", (e) => {
      e.preventDefault();
      browserAPI.tabs.create({ url: bm.url });
    });
    card.appendChild(urlElem);

    // Tags
    if (bm.tags && bm.tags.length > 0) {
      const tagsRow = document.createElement("div");
      tagsRow.className = "bm-tags-row";
      bm.tags.forEach((tg) => {
        const badge = document.createElement("span");
        badge.className = "bm-tag-badge";
        badge.textContent = tg;
        badge.title = `Filter by tag: ${tg}`;
        badge.addEventListener("click", () => setTagFilter(tg));
        tagsRow.appendChild(badge);
      });
      card.appendChild(tagsRow);
    }

    // Description / Comment
    if (bm.description) {
      const desc = document.createElement("div");
      desc.className = "bm-desc truncate";
      desc.textContent = bm.description;
      desc.title = bm.description;
      card.appendChild(desc);
    }

    // Action buttons bar
    const actions = document.createElement("div");
    actions.className = "bm-actions";

    // 1. Open current tab
    const btnOpenCurrent = document.createElement("button");
    btnOpenCurrent.className = "bm-btn";
    btnOpenCurrent.innerHTML = "⧉ Here";
    btnOpenCurrent.title = "Open in current tab";
    btnOpenCurrent.addEventListener("click", () => {
      browserAPI.tabs.update({ url: bm.url });
    });

    // 2. Copy URL
    const btnCopy = document.createElement("button");
    btnCopy.className = "bm-btn";
    btnCopy.innerHTML = "📋 Copy";
    btnCopy.title = "Copy URL to clipboard";
    btnCopy.addEventListener("click", () => {
      navigator.clipboard.writeText(bm.url);
      showToast("Copied to clipboard!", "info", 2000);
    });

    // 3. Edit tags
    const btnEdit = document.createElement("button");
    btnEdit.className = "bm-btn";
    btnEdit.innerHTML = "✏️ Edit";
    btnEdit.title = "Edit tags or description";
    btnEdit.addEventListener("click", () => promptEditBookmark(bm));

    // 4. Delete
    const btnDelete = document.createElement("button");
    btnDelete.className = "bm-btn delete";
    btnDelete.innerHTML = "🗑️ Delete";
    btnDelete.title = "Delete bookmark from Buku";
    btnDelete.addEventListener("click", () => confirmDeleteBookmark(bm));

    actions.appendChild(btnOpenCurrent);
    actions.appendChild(btnCopy);
    actions.appendChild(btnEdit);
    actions.appendChild(btnDelete);
    card.appendChild(actions);

    bookmarksList.appendChild(card);
  });
}

function promptEditBookmark(bm) {
  const newTags = prompt(`Edit tags for #${bm.id} (${bm.title}):`, (bm.tags || []).join(", "));
  if (newTags === null) return;

  sendToBackend("update_bookmark", {
    id: bm.id,
    tags: newTags,
  })
    .then(() => {
      showToast(`Updated tags for #${bm.id}`, "success");
      loadBookmarks(searchBox.value.trim());
      loadTags();
    })
    .catch((err) => showToast("Update failed: " + err.message, "error"));
}

function confirmDeleteBookmark(bm) {
  if (confirm(`Permanently delete bookmark #${bm.id} (${bm.title}) from Buku?`)) {
    sendToBackend("delete_bookmark", { id: bm.id })
      .then(() => {
        showToast(`Deleted bookmark #${bm.id}`, "info");
        loadBookmarks(searchBox.value.trim());
        loadTags();
        refreshStatus();
      })
      .catch((err) => showToast("Delete failed: " + err.message, "error"));
  }
}

// Open all in tag
btnOpenAllInTag.addEventListener("click", () => {
  if (!allBookmarks || allBookmarks.length === 0) return;
  const count = allBookmarks.length;
  if (confirm(`Open all ${count} bookmarks in group '${currentFilterTag}' in separate tabs?`)) {
    allBookmarks.forEach((bm) => {
      browserAPI.tabs.create({ url: bm.url, active: false });
    });
    showToast(`Opened ${count} tabs for '${currentFilterTag}'!`, "success");
  }
});

// -----------------------------------------------------------------------------
// Tab 3: Batch Tabs
// -----------------------------------------------------------------------------

async function loadWindowTabs() {
  tabsList.innerHTML = `<div class="empty-state">Loading open tabs...</div>`;
  try {
    const tabs = await new Promise((resolve) => {
      browserAPI.tabs.query({ currentWindow: true }, (res) => resolve(res || []));
    });

    const validTabs = tabs.filter((t) => t.url && !t.url.startsWith("chrome://") && !t.url.startsWith("about:"));
    batchTotalCount.textContent = validTabs.length;

    tabsList.innerHTML = "";
    validTabs.forEach((t) => {
      const item = document.createElement("label");
      item.className = "tab-check-item";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = true;
      cb.dataset.url = t.url;
      cb.dataset.title = t.title || t.url;
      cb.addEventListener("change", updateBatchSelectedCount);

      const favicon = document.createElement("img");
      favicon.className = "tab-favicon";
      favicon.src = t.favIconUrl || "../icons/icon-16.png";
      favicon.onerror = () => {
        favicon.src = "../icons/icon-16.png";
      };

      const info = document.createElement("div");
      info.className = "tab-info";

      const titleSpan = document.createElement("span");
      titleSpan.className = "tab-title";
      titleSpan.textContent = t.title || t.url;

      const urlSpan = document.createElement("span");
      urlSpan.className = "tab-url-text";
      urlSpan.textContent = t.url;

      info.appendChild(titleSpan);
      info.appendChild(urlSpan);

      item.appendChild(cb);
      item.appendChild(favicon);
      item.appendChild(info);
      tabsList.appendChild(item);
    });

    updateBatchSelectedCount();
  } catch (err) {
    tabsList.innerHTML = `<div class="empty-state">Failed to query tabs: ${err.message}</div>`;
  }
}

function updateBatchSelectedCount() {
  const checked = tabsList.querySelectorAll("input[type='checkbox']:checked");
  batchSelectedCount.textContent = checked.length;
}

btnBatchSelectAll.addEventListener("click", () => {
  tabsList.querySelectorAll("input[type='checkbox']").forEach((cb) => (cb.checked = true));
  updateBatchSelectedCount();
});

btnBatchDeselectAll.addEventListener("click", () => {
  tabsList.querySelectorAll("input[type='checkbox']").forEach((cb) => (cb.checked = false));
  updateBatchSelectedCount();
});

btnSaveBatchTabs.addEventListener("click", async () => {
  const tag = batchTagInput.value.trim();
  if (!tag) {
    showToast("Please provide a Tag / Group name for the tabs!", "error");
    batchTagInput.focus();
    return;
  }

  const checkedBoxes = Array.from(tabsList.querySelectorAll("input[type='checkbox']:checked"));
  if (checkedBoxes.length === 0) {
    showToast("No tabs selected!", "error");
    return;
  }

  const items = checkedBoxes.map((cb) => ({
    url: cb.dataset.url,
    title: cb.dataset.title,
  }));

  btnSaveBatchTabs.disabled = true;
  btnSaveBatchTabs.textContent = "Saving tabs...";

  try {
    const res = await sendToBackend("add_batch", {
      bookmarks: items,
      tag: tag,
    });
    showToast(res.message || `Saved ${items.length} tabs to '${tag}'!`, "success");
    await loadBookmarks();
    await loadTags();
    await refreshStatus();
  } catch (err) {
    showToast("Batch save failed: " + err.message, "error");
  } finally {
    btnSaveBatchTabs.disabled = false;
    btnSaveBatchTabs.textContent = "📑 Save Selected Tabs to Buku";
  }
});

// -----------------------------------------------------------------------------
// Tab 4: Emacs Hub Actions
// -----------------------------------------------------------------------------

function setupEmacsCommands() {
  const cards = document.querySelectorAll(".cmd-card");
  cards.forEach((card) => {
    card.addEventListener("click", async () => {
      const action = card.getAttribute("data-emacs-action");
      card.style.opacity = "0.6";
      try {
        const res = await sendToBackend("open_in_emacs", { action });
        showToast(res.message || `Executed in Emacs!`, "success");
      } catch (err) {
        showToast(err.message, "error", 4000);
      } finally {
        card.style.opacity = "1";
      }
    });
  });

  btnAddViaEmacs.addEventListener("click", async () => {
    const url = pageUrl.value.trim();
    const title = pageTitle.value.trim();
    const tags = pageTags.value.trim();
    const comment = pageComment.value.trim();

    try {
      const res = await sendToBackend("open_in_emacs", {
        action: "add_bookmark",
        url,
        title,
        tags,
        description: comment,
      });
      showToast(res.message || "Opened add prompt in Emacs!", "success");
    } catch (err) {
      showToast(err.message, "error", 4000);
    }
  });
}

// -----------------------------------------------------------------------------
// General Event Listeners
// -----------------------------------------------------------------------------

function setupEventListeners() {
  // Form submission
  addBookmarkForm.addEventListener("submit", handleSaveBookmark);

  // Tags autocomplete
  setupTagsAutocomplete();

  // Search input debouncing
  let searchTimeout = null;
  searchBox.addEventListener("input", () => {
    const q = searchBox.value.trim();
    if (q) {
      btnClearSearch.classList.remove("hidden");
    } else {
      btnClearSearch.classList.add("hidden");
    }

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      loadBookmarks(q);
    }, 250);
  });

  btnClearSearch.addEventListener("click", () => {
    searchBox.value = "";
    btnClearSearch.classList.add("hidden");
    loadBookmarks("");
    searchBox.focus();
  });

  // Emacs Hub command buttons
  setupEmacsCommands();

  // Settings button
  btnSettings.addEventListener("click", () => {
    browserAPI.runtime.openOptionsPage?.() || window.open(browserAPI.runtime.getURL("options/options.html"));
  });

  // Sync / Reload
  linkReload.addEventListener("click", async (e) => {
    e.preventDefault();
    showToast("Syncing with Buku...", "info", 1500);
    await refreshStatus();
    await loadBookmarks(searchBox.value.trim());
    await loadTags();
  });
}

// Start
document.addEventListener("DOMContentLoaded", init);
