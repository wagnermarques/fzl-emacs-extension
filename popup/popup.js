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
let groupsSortMode = "alpha"; // "alpha" or "count"
let currentSelectedGroup = null;
let currentGroupBookmarks = [];

// DOM Elements
const toastBar = document.getElementById("toastBar");
const footerStatus = document.getElementById("footerStatus");
const bookmarkTotalBadge = document.getElementById("bookmarkTotalBadge");
const emacsStatusBadge = document.getElementById("emacsStatusBadge");
const btnSettings = document.getElementById("btnSettings");
const btnSidePanel = document.getElementById("btnSidePanel");
const btnPopout = document.getElementById("btnPopout");
const resizeHandle = document.getElementById("resizeHandle");
const resizeBarBottom = document.getElementById("resizeBarBottom");
const btnToggleFullHeight = document.getElementById("btnToggleFullHeight");
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

// Tab Groups Elements
const groupsTotalBadge = document.getElementById("groupsTotalBadge");
const groupsListView = document.getElementById("groupsListView");
const groupFilterInput = document.getElementById("groupFilterInput");
const btnClearGroupFilter = document.getElementById("btnClearGroupFilter");
const groupsCountSummary = document.getElementById("groupsCountSummary");
const btnSortAlpha = document.getElementById("btnSortAlpha");
const btnSortCount = document.getElementById("btnSortCount");
const alphabetJumpBar = document.getElementById("alphabetJumpBar");
const groupsAlphabeticalList = document.getElementById("groupsAlphabeticalList");

// Group Detail Elements
const groupDetailView = document.getElementById("groupDetailView");
const btnBackToGroups = document.getElementById("btnBackToGroups");
const groupDetailSelect = document.getElementById("groupDetailSelect");
const groupDetailTitle = document.getElementById("groupDetailTitle");
const groupDetailCountBadge = document.getElementById("groupDetailCountBadge");
const btnOpenAllGroupUrls = document.getElementById("btnOpenAllGroupUrls");
const btnCopyAllGroupUrls = document.getElementById("btnCopyAllGroupUrls");
const groupUrlsSearchBox = document.getElementById("groupUrlsSearchBox");
const btnClearGroupUrlsSearch = document.getElementById("btnClearGroupUrlsSearch");
const groupBookmarksList = document.getElementById("groupBookmarksList");

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
      } else if (targetId === "tabGroups") {
        if (!currentSelectedGroup) {
          renderGroupsList();
        }
      }
    });
  });
}

// -----------------------------------------------------------------------------
// Initialization & Status
// -----------------------------------------------------------------------------

function initWindowAndResize() {
  const urlParams = new URLSearchParams(window.location.search);
  const isWindow = urlParams.get("mode") === "window";
  const isSidepanel = urlParams.get("mode") === "sidepanel" || (window.innerWidth <= 550 && window.innerHeight > 650);

  if (isWindow) {
    document.body.classList.add("is-window");
  } else if (isSidepanel) {
    document.body.classList.add("is-sidepanel");
  } else {
    // Load saved dimensions for popup mode (clamped safely to 600px max in standard dropdown popup to prevent internal scrollbars)
    browserAPI.storage.local.get({ popupWidth: 460, popupHeight: 560 }, (items) => {
      if (items.popupWidth && items.popupHeight) {
        applyPopupSize(items.popupWidth, items.popupHeight);
      }
    });
    setupResizeHandle();
    setupVerticalResizeBar();
    setupFullHeightToggle();
  }

  setupPopout();
  setupSidePanel();
}

function applyPopupSize(width, height) {
  // In Chromium dropdown popups, the browser engine physically caps the popup bubble at 600px.
  // Exceeding 600px in a popup bubble doesn't grow the window; it causes the browser to add a scrollbar.
  // In Firefox, popup bubbles can grow up to ~800px.
  const isChromium = !navigator.userAgent.includes("Firefox");
  const maxPopupHeight = isChromium ? 600 : Math.min(800, window.screen?.availHeight ? Math.round(window.screen.availHeight * 0.9) : 800);

  const w = Math.min(800, Math.max(380, Math.round(width)));
  const h = Math.min(maxPopupHeight, Math.max(350, Math.round(height)));
  document.body.style.width = `${w}px`;
  document.body.style.height = `${h}px`;

  // Update button label if near maximum popup bubble height
  if (btnToggleFullHeight) {
    if (h >= maxPopupHeight - 10) {
      btnToggleFullHeight.textContent = "↕ Standard Height";
    } else {
      btnToggleFullHeight.textContent = `↕ Max Height (${maxPopupHeight}px)`;
    }
  }
}

function setupResizeHandle() {
  if (!resizeHandle) return;

  let isResizing = false;
  let startX = 0;
  let startY = 0;
  let startWidth = 0;
  let startHeight = 0;

  resizeHandle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    isResizing = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = document.body.getBoundingClientRect();
    startWidth = rect.width;
    startHeight = rect.height;
    document.body.style.userSelect = "none";

    const onMouseMove = (moveEvent) => {
      if (!isResizing) return;
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      applyPopupSize(startWidth + deltaX, startHeight + deltaY);
    };

    const onMouseUp = () => {
      if (!isResizing) return;
      isResizing = false;
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);

      const finalRect = document.body.getBoundingClientRect();
      browserAPI.storage.local.set({
        popupWidth: Math.round(finalRect.width),
        popupHeight: Math.round(finalRect.height),
      });
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  });
}

function setupVerticalResizeBar() {
  if (!resizeBarBottom) return;

  let isResizing = false;
  let startY = 0;
  let startHeight = 0;

  resizeBarBottom.addEventListener("mousedown", (e) => {
    e.preventDefault();
    isResizing = true;
    startY = e.clientY;
    startHeight = document.body.getBoundingClientRect().height;
    document.body.style.userSelect = "none";

    const onMouseMove = (moveEvent) => {
      if (!isResizing) return;
      const deltaY = moveEvent.clientY - startY;
      const newHeight = startHeight + deltaY;
      applyPopupSize(document.body.getBoundingClientRect().width, newHeight);
    };

    const onMouseUp = () => {
      if (!isResizing) return;
      isResizing = false;
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);

      const finalRect = document.body.getBoundingClientRect();
      browserAPI.storage.local.set({
        popupHeight: Math.round(finalRect.height),
      });
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  });
}

function setupFullHeightToggle() {
  if (!btnToggleFullHeight) return;

  btnToggleFullHeight.addEventListener("click", (e) => {
    e.preventDefault();
    const isChromium = !navigator.userAgent.includes("Firefox");
    const maxPopupHeight = isChromium ? 600 : 800;
    const currentHeight = document.body.getBoundingClientRect().height;

    if (currentHeight >= maxPopupHeight - 15) {
      applyPopupSize(document.body.getBoundingClientRect().width, 540);
      browserAPI.storage.local.set({ popupHeight: 540 });
    } else {
      applyPopupSize(document.body.getBoundingClientRect().width, maxPopupHeight);
      browserAPI.storage.local.set({ popupHeight: maxPopupHeight });
    }
  });
}

function setupPopout() {
  if (!btnPopout) return;
  btnPopout.addEventListener("click", () => {
    const popoutUrl = browserAPI.runtime.getURL("popup/popup.html?mode=window");
    if (browserAPI.windows && browserAPI.windows.create) {
      browserAPI.windows.create({
        url: popoutUrl,
        type: "popup",
        width: 720,
        height: 750,
        focused: true,
      });
      window.close();
    } else {
      browserAPI.tabs.create({ url: popoutUrl });
      window.close();
    }
  });
}

function setupSidePanel() {
  if (!btnSidePanel) return;

  btnSidePanel.addEventListener("click", async () => {
    try {
      if (browserAPI.sidePanel && browserAPI.sidePanel.open) {
        const tabs = await new Promise((res) => {
          browserAPI.tabs.query({ active: true, currentWindow: true }, (r) => res(r || []));
        });
        const currentWindowId = tabs[0]?.windowId;
        if (currentWindowId) {
          await browserAPI.sidePanel.open({ windowId: currentWindowId });
          window.close();
          return;
        }
      }
      if (browserAPI.sidebarAction && browserAPI.sidebarAction.open) {
        await browserAPI.sidebarAction.open();
        window.close();
        return;
      }
    } catch (e) {
      console.warn("Direct side panel open error:", e);
    }

    // Fallback if browser doesn't permit direct script opening of sidepanel: open floating window
    btnPopout?.click();
  });
}

async function init() {
  initWindowAndResize();
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
      if (groupsTotalBadge) {
        groupsTotalBadge.textContent = allTags.length;
      }
      renderQuickTags(allTags);
      renderTagsCarousel(allTags);
      renderGroupsList();
      populateGroupDetailSelect();
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

function createBookmarkCard(bm, { onTagClick } = {}) {
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
      badge.title = `Filter by group: ${tg}`;
      badge.addEventListener("click", () => {
        if (onTagClick) {
          onTagClick(tg);
        } else {
          setTagFilter(tg);
        }
      });
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

  return card;
}

function renderBookmarksList(bookmarks) {
  if (!bookmarks || bookmarks.length === 0) {
    bookmarksList.innerHTML = `<div class="empty-state">No bookmarks found.</div>`;
    return;
  }

  bookmarksList.innerHTML = "";
  bookmarks.forEach((bm) => {
    const card = createBookmarkCard(bm);
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
      if (currentSelectedGroup) {
        loadGroupBookmarks(currentSelectedGroup);
      }
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
        if (currentSelectedGroup) {
          loadGroupBookmarks(currentSelectedGroup);
        }
      })
      .catch((err) => showToast("Delete failed: " + err.message, "error"));
  }
}

// -----------------------------------------------------------------------------
// Tab Groups & Group Bookmarks
// -----------------------------------------------------------------------------

function renderGroupsList() {
  if (!groupsAlphabeticalList) return;

  if (!allTags || allTags.length === 0) {
    groupsAlphabeticalList.innerHTML = `<div class="empty-state">No groups found in Buku database.</div>`;
    if (groupsCountSummary) groupsCountSummary.textContent = "0 groups";
    if (alphabetJumpBar) alphabetJumpBar.innerHTML = "";
    return;
  }

  // 1. Sort tags
  let sorted = allTags.slice();
  if (groupsSortMode === "alpha") {
    sorted.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  } else {
    sorted.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }

  // 2. Filter by search input
  const q = groupFilterInput ? groupFilterInput.value.trim().toLowerCase() : "";
  if (q) {
    sorted = sorted.filter((t) => t.name.toLowerCase().includes(q));
  }

  if (groupsCountSummary) {
    groupsCountSummary.textContent = `${sorted.length} of ${allTags.length} group${allTags.length === 1 ? "" : "s"}`;
  }

  if (sorted.length === 0) {
    groupsAlphabeticalList.innerHTML = `<div class="empty-state">No groups match "${q}".</div>`;
    if (alphabetJumpBar) alphabetJumpBar.innerHTML = "";
    return;
  }

  groupsAlphabeticalList.innerHTML = "";
  if (alphabetJumpBar) alphabetJumpBar.innerHTML = "";

  if (groupsSortMode === "alpha") {
    // Group into alphabetical sections
    const letterMap = new Map();
    sorted.forEach((t) => {
      const firstChar = t.name.charAt(0).toUpperCase();
      const letter = /[A-Z]/.test(firstChar) ? firstChar : "#";
      if (!letterMap.has(letter)) {
        letterMap.set(letter, []);
      }
      letterMap.get(letter).push(t);
    });

    // Populate alphabet jump bar
    letterMap.forEach((_, letter) => {
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "jump-pill";
      pill.textContent = letter;
      pill.title = `Jump to ${letter}`;
      pill.addEventListener("click", () => {
        const target = document.getElementById(`letter-sec-${letter}`);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
      alphabetJumpBar.appendChild(pill);
    });

    // Render each letter section
    letterMap.forEach((items, letter) => {
      const sec = document.createElement("div");
      sec.className = "letter-section";
      sec.id = `letter-sec-${letter}`;

      const secHeader = document.createElement("div");
      secHeader.className = "letter-header";
      secHeader.textContent = letter;
      sec.appendChild(secHeader);

      const itemsList = document.createElement("div");
      itemsList.className = "letter-items-list";

      items.forEach((item) => {
        const row = createGroupRow(item);
        itemsList.appendChild(row);
      });

      sec.appendChild(itemsList);
      groupsAlphabeticalList.appendChild(sec);
    });
  } else {
    // Count mode: straightforward list
    const itemsList = document.createElement("div");
    itemsList.className = "letter-items-list";
    sorted.forEach((item) => {
      const row = createGroupRow(item);
      itemsList.appendChild(row);
    });
    groupsAlphabeticalList.appendChild(itemsList);
  }
}

function createGroupRow(item) {
  const row = document.createElement("div");
  row.className = "group-row";
  row.setAttribute("role", "button");
  row.tabIndex = 0;
  row.title = `Click to view URLs in group '${item.name}'`;

  const left = document.createElement("div");
  left.className = "group-row-main";

  const icon = document.createElement("span");
  icon.className = "group-row-icon";
  icon.textContent = "🏷️";

  const name = document.createElement("span");
  name.className = "group-row-name";
  name.textContent = item.name;

  left.appendChild(icon);
  left.appendChild(name);

  const right = document.createElement("div");
  right.className = "group-row-meta";

  const badge = document.createElement("span");
  badge.className = "group-badge";
  badge.textContent = `${item.count} URL${item.count === 1 ? "" : "s"}`;

  const arrow = document.createElement("span");
  arrow.className = "group-row-arrow";
  arrow.textContent = "›";

  right.appendChild(badge);
  right.appendChild(arrow);

  row.appendChild(left);
  row.appendChild(right);

  const onSelect = () => selectGroup(item.name);
  row.addEventListener("click", onSelect);
  row.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  });

  return row;
}

function populateGroupDetailSelect() {
  if (!groupDetailSelect) return;
  groupDetailSelect.innerHTML = "";

  const sorted = allTags.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  sorted.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.name;
    opt.textContent = `${t.name} (${t.count})`;
    groupDetailSelect.appendChild(opt);
  });

  if (currentSelectedGroup) {
    groupDetailSelect.value = currentSelectedGroup;
  }
}

async function selectGroup(groupName) {
  if (!groupName) return;
  currentSelectedGroup = groupName;

  if (groupsListView) groupsListView.classList.add("hidden");
  if (groupDetailView) groupDetailView.classList.remove("hidden");

  if (groupDetailTitle) groupDetailTitle.textContent = groupName;
  if (groupDetailSelect) groupDetailSelect.value = groupName;
  if (groupUrlsSearchBox) groupUrlsSearchBox.value = "";
  if (btnClearGroupUrlsSearch) btnClearGroupUrlsSearch.classList.add("hidden");

  await loadGroupBookmarks(groupName);
}

async function loadGroupBookmarks(groupName) {
  if (!groupBookmarksList) return;
  groupBookmarksList.innerHTML = `<div class="empty-state">Loading bookmarks in '${groupName}'...</div>`;

  try {
    const res = await sendToBackend("get_bookmarks", {
      tag: groupName,
      limit: 1000,
    });
    if (res && res.bookmarks) {
      currentGroupBookmarks = res.bookmarks;
    } else {
      currentGroupBookmarks = [];
    }
    renderGroupBookmarks(currentGroupBookmarks);
  } catch (err) {
    groupBookmarksList.innerHTML = `<div class="empty-state">Error loading bookmarks: ${err.message}</div>`;
  }
}

function renderGroupBookmarks(bookmarks) {
  if (!groupBookmarksList) return;

  if (groupDetailCountBadge) {
    groupDetailCountBadge.textContent = `${bookmarks.length} URL${bookmarks.length === 1 ? "" : "s"}`;
  }

  const query = groupUrlsSearchBox ? groupUrlsSearchBox.value.trim().toLowerCase() : "";
  let displayed = bookmarks;
  if (query) {
    const terms = query.split(/\s+/);
    displayed = bookmarks.filter((bm) => {
      const searchStr = `${bm.title || ""} ${bm.url || ""} ${bm.description || ""} ${(bm.tags || []).join(" ")}`.toLowerCase();
      return terms.every((t) => searchStr.includes(t));
    });
  }

  if (!displayed || displayed.length === 0) {
    groupBookmarksList.innerHTML = `<div class="empty-state">${query ? `No matching bookmarks in '${currentSelectedGroup}'.` : `No bookmarks found in group '${currentSelectedGroup}'.`}</div>`;
    return;
  }

  groupBookmarksList.innerHTML = "";
  displayed.forEach((bm) => {
    const card = createBookmarkCard(bm, {
      onTagClick: (newTag) => {
        selectGroup(newTag);
      },
    });
    groupBookmarksList.appendChild(card);
  });
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
    if (currentSelectedGroup) {
      await loadGroupBookmarks(currentSelectedGroup);
    }
  });

  // Tab Groups: Sort toggle
  if (btnSortAlpha && btnSortCount) {
    btnSortAlpha.addEventListener("click", () => {
      groupsSortMode = "alpha";
      btnSortAlpha.classList.add("active");
      btnSortCount.classList.remove("active");
      renderGroupsList();
    });

    btnSortCount.addEventListener("click", () => {
      groupsSortMode = "count";
      btnSortCount.classList.add("active");
      btnSortAlpha.classList.remove("active");
      renderGroupsList();
    });
  }

  // Tab Groups: Filter groups input
  if (groupFilterInput && btnClearGroupFilter) {
    let groupFilterTimeout = null;
    groupFilterInput.addEventListener("input", () => {
      const q = groupFilterInput.value.trim();
      if (q) {
        btnClearGroupFilter.classList.remove("hidden");
      } else {
        btnClearGroupFilter.classList.add("hidden");
      }
      clearTimeout(groupFilterTimeout);
      groupFilterTimeout = setTimeout(renderGroupsList, 150);
    });

    btnClearGroupFilter.addEventListener("click", () => {
      groupFilterInput.value = "";
      btnClearGroupFilter.classList.add("hidden");
      renderGroupsList();
      groupFilterInput.focus();
    });
  }

  // Tab Groups: Back button
  if (btnBackToGroups) {
    btnBackToGroups.addEventListener("click", () => {
      if (groupDetailView) groupDetailView.classList.add("hidden");
      if (groupsListView) groupsListView.classList.remove("hidden");
      currentSelectedGroup = null;
      renderGroupsList();
    });
  }

  // Tab Groups: Detail dropdown selector
  if (groupDetailSelect) {
    groupDetailSelect.addEventListener("change", (e) => {
      selectGroup(e.target.value);
    });
  }

  // Tab Groups: Open all in group
  if (btnOpenAllGroupUrls) {
    btnOpenAllGroupUrls.addEventListener("click", () => {
      if (!currentGroupBookmarks || currentGroupBookmarks.length === 0) {
        showToast("No bookmarks to open in this group!", "info");
        return;
      }
      const count = currentGroupBookmarks.length;
      if (confirm(`Open all ${count} URLs in group '${currentSelectedGroup}' in separate tabs?`)) {
        currentGroupBookmarks.forEach((bm) => {
          browserAPI.tabs.create({ url: bm.url, active: false });
        });
        showToast(`Opened ${count} tabs for group '${currentSelectedGroup}'!`, "success");
      }
    });
  }

  // Tab Groups: Copy all URLs in group
  if (btnCopyAllGroupUrls) {
    btnCopyAllGroupUrls.addEventListener("click", () => {
      if (!currentGroupBookmarks || currentGroupBookmarks.length === 0) {
        showToast("No URLs to copy in this group!", "info");
        return;
      }
      const urlsText = currentGroupBookmarks.map((bm) => bm.url).join("\n");
      navigator.clipboard.writeText(urlsText);
      showToast(`Copied ${currentGroupBookmarks.length} URLs to clipboard!`, "info", 2000);
    });
  }

  // Tab Groups: Filter bookmarks within selected group
  if (groupUrlsSearchBox && btnClearGroupUrlsSearch) {
    let groupUrlsSearchTimeout = null;
    groupUrlsSearchBox.addEventListener("input", () => {
      const q = groupUrlsSearchBox.value.trim();
      if (q) {
        btnClearGroupUrlsSearch.classList.remove("hidden");
      } else {
        btnClearGroupUrlsSearch.classList.add("hidden");
      }
      clearTimeout(groupUrlsSearchTimeout);
      groupUrlsSearchTimeout = setTimeout(() => {
        renderGroupBookmarks(currentGroupBookmarks);
      }, 150);
    });

    btnClearGroupUrlsSearch.addEventListener("click", () => {
      groupUrlsSearchBox.value = "";
      btnClearGroupUrlsSearch.classList.add("hidden");
      renderGroupBookmarks(currentGroupBookmarks);
      groupUrlsSearchBox.focus();
    });
  }
}

// Start
document.addEventListener("DOMContentLoaded", init);
