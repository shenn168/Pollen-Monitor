// ============================================================
// PollenWatch - Popup Logic (Updated)
// ============================================================

const MAX_POLLEN_INDEX = 12;

const CATEGORY_CONFIG = [
  { key: "tree_index",  label: "Tree",  icon: "🌳", category: "Tree" },
  { key: "grass_index", label: "Grass", icon: "🌾", category: "Grass" },
  { key: "weed_index",  label: "Weed",  icon: "🌿", category: "Weed" },
  { key: "mold_index",  label: "Mold",  icon: "🍄", category: "Mold" }
];

let currentLocations = [];
let selectedIndex = 0;
let loadGeneration = 0;
let errorTimeout = null;

document.addEventListener("DOMContentLoaded", init);

// ============================================================
// Utility: HTML Escaping (XSS Protection)
// ============================================================

function escapeHtml(str) {
  if (typeof str !== "string") { return ""; }
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// ============================================================
// Initialization
// ============================================================

async function init() {
  const stored = await chrome.storage.local.get(["locations", "selectedIndex"]);
  currentLocations = stored.locations || [];
  selectedIndex = stored.selectedIndex || 0;
  if (selectedIndex >= currentLocations.length) { selectedIndex = 0; }

  if (currentLocations.length === 0) {
    showView("first-run");
  } else {
    populateSelect();
    showView("current");
    loadData();
  }

  document.getElementById("btn-settings").addEventListener("click", openSettings);
  document.getElementById("btn-back").addEventListener("click", closeSettings);
  document.getElementById("btn-refresh").addEventListener("click", loadData);
  document.getElementById("btn-add-zip").addEventListener("click", addZipFromSettings);
  document.getElementById("btn-add-first").addEventListener("click", addZipFirst);
  document.getElementById("btn-forecast").addEventListener("click", openSidebar);
  document.getElementById("location-select").addEventListener("change", onLocationChange);

  document.getElementById("input-zip-first").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { addZipFirst(); }
  });
  document.getElementById("input-zip").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { addZipFromSettings(); }
  });
}

// ============================================================
// View Management
// ============================================================

function showView(view) {
  const ids = ["loading", "error", "current", "settings", "first-run"];
  for (let i = 0; i < ids.length; i++) {
    document.getElementById(ids[i]).classList.add("hidden");
  }
  const hideBar = (view === "first-run" || view === "settings");
  document.getElementById("location-bar").classList.toggle("hidden", hideBar);
  document.getElementById(view).classList.remove("hidden");
}

// ============================================================
// Location Select
// ============================================================

function populateSelect() {
  const sel = document.getElementById("location-select");
  sel.innerHTML = "";
  for (let i = 0; i < currentLocations.length; i++) {
    const loc = currentLocations[i];
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = loc.zip + " — " + escapeHtml(loc.name) + ", " + escapeHtml(loc.admin);
    sel.appendChild(opt);
  }
  sel.value = selectedIndex;
}

function onLocationChange() {
  selectedIndex = parseInt(document.getElementById("location-select").value, 10);
  chrome.storage.local.set({ selectedIndex: selectedIndex });
  loadData();
}

// ============================================================
// Add ZIP Code
// ============================================================

async function addZipFirst() {
  await addZip(document.getElementById("input-zip-first"));
}

async function addZipFromSettings() {
  await addZip(document.getElementById("input-zip"));
  renderZipList();
  populateSelect();
}

async function addZip(inputEl) {
  const zip = inputEl.value.trim();
  if (!zip) { return; }
  for (let i = 0; i < currentLocations.length; i++) {
    if (currentLocations[i].zip === zip) {
      showError("This ZIP code is already added.");
      return;
    }
  }
  inputEl.value = "";
  showView("loading");

  const coords = await zipToCoords(zip);
  if (!coords) {
    showError("Could not find location for this ZIP code.");
    return;
  }

  currentLocations.push({
    zip: zip, lat: coords.lat, lon: coords.lon,
    name: coords.name, admin: coords.admin
  });
  selectedIndex = currentLocations.length - 1;
  await chrome.storage.local.set({ locations: currentLocations, selectedIndex: selectedIndex });
  populateSelect();
  showView("current");
  loadData();
}

// ============================================================
// Error Handling (with timeout clearing)
// ============================================================

function showError(msg) {
  if (errorTimeout) { clearTimeout(errorTimeout); }
  document.getElementById("error-msg").textContent = msg;
  showView("error");
  errorTimeout = setTimeout(() => {
    errorTimeout = null;
    if (currentLocations.length > 0) { showView("current"); }
    else { showView("first-run"); }
  }, 3000);
}

// ============================================================
// Data Loading (with race condition guard)
// ============================================================

async function loadData() {
  if (currentLocations.length === 0) { return; }
  const thisGeneration = ++loadGeneration;
  showView("loading");

  try {
    const loc = currentLocations[selectedIndex];
    if (!loc) { showError("Invalid location."); return; }

    const pollenData = await fetchAllPollenData(loc.zip, loc.lat, loc.lon);

    // Abort if a newer request was initiated while this one was in-flight
    if (thisGeneration !== loadGeneration) { return; }

    if (!pollenData || !pollenData.today) {
      showError("No pollen data available for this location right now.");
      return;
    }

    // Cache for sidebar
    await chrome.storage.local.set({
      cachedPollenData: pollenData,
      cachedLocation: loc
    });

    renderCurrentView(pollenData);
    showView("current");
    updateBadge(pollenData.today);
  } catch (err) {
    // Abort if a newer request was initiated while this one was in-flight
    if (thisGeneration !== loadGeneration) { return; }
    console.error("PollenWatch loadData error:", err);
    showError("Failed to fetch data. Check your connection.");
  }
}

// ============================================================
// Rendering: Current View (split into sub-renderers)
// ============================================================

function renderCurrentView(pollenData) {
  const today = pollenData.today;
  renderBanner(today);
  renderCards(today);
  renderTriggers(today);
  renderWeather(today);
}

function renderBanner(today) {
  const banner = document.getElementById("overall-banner");
  const sev = getSeverityFromIndex(today.index);
  banner.style.background = sev.bg;
  banner.style.border = "1px solid " + sev.color + "44";

  let bh = "";
  bh += '<div class="banner-index" style="color:' + escapeHtml(sev.color) + '">';
  bh += escapeHtml(sev.emoji) + " " + escapeHtml(String(today.index)) + "/" + MAX_POLLEN_INDEX;
  bh += "</div>";
  bh += '<div class="banner-label" style="color:' + escapeHtml(sev.color) + '">';
  bh += escapeHtml(today.category) + " Pollen Level";
  bh += "</div>";
  bh += '<div class="banner-scale">Overall pollen index (0-' + MAX_POLLEN_INDEX + ' scale)</div>';
  banner.innerHTML = bh;
}

function renderCards(today) {
  const grid = document.getElementById("cards-grid");
  grid.innerHTML = "";

  for (let i = 0; i < CATEGORY_CONFIG.length; i++) {
    const cfg = CATEGORY_CONFIG[i];
    const value = today[cfg.key] || 0;
    const cardSev = getSeverityFromIndex(value);
    const pct = Math.min((value / MAX_POLLEN_INDEX) * 100, 100);

    const card = document.createElement("div");
    card.className = "pollen-card";
    card.style.borderLeftColor = cardSev.color;

    let ch = "";
    ch += '<div class="card-header">';
    ch += '<span class="card-type">' + escapeHtml(cfg.label) + "</span>";
    ch += '<span class="card-emoji">' + escapeHtml(cardSev.emoji) + "</span>";
    ch += "</div>";
    ch += '<div class="card-value" style="color:' + escapeHtml(cardSev.color) + '">';
    ch += escapeHtml(String(value)) + "</div>";
    ch += '<div class="card-label">' + escapeHtml(cardSev.label) + " &middot; " + escapeHtml(cfg.icon) + " " + escapeHtml(cfg.category) + "</div>";
    ch += '<div class="card-bar">';
    ch += '<div class="card-bar-fill" style="width:' + pct + "%;background:" + escapeHtml(cardSev.color) + '"></div>';
    ch += "</div>";

    card.innerHTML = ch;
    grid.appendChild(card);
  }
}

function renderTriggers(today) {
  const triggersSection = document.getElementById("triggers-section");
  const triggersList = document.getElementById("triggers-list");
  const triggers = today.triggers || [];

  if (triggers.length > 0) {
    triggersSection.classList.remove("hidden");
    triggersList.innerHTML = "";
    for (let t = 0; t < triggers.length; t++) {
      const tr = triggers[t];
      let tagClass = "trigger-tag";
      const typeLower = (tr.type || "").toLowerCase();
      if (typeLower === "tree") { tagClass += " tree"; }
      else if (typeLower === "grass") { tagClass += " grass"; }
      else if (typeLower === "weed") { tagClass += " weed"; }
      else if (typeLower === "mold") { tagClass += " mold"; }

      const tag = document.createElement("span");
      tag.className = tagClass;
      tag.textContent = tr.name; // textContent is inherently safe
      triggersList.appendChild(tag);
    }
  } else {
    triggersSection.classList.add("hidden");
  }
}

function renderWeather(today) {
  const weatherDiv = document.getElementById("weather-info");
  const w = today.weather;
  if (w) {
    let wh = "";
    wh += '<div class="weather-item"><div class="weather-val">🌡️ ' + escapeHtml(String(Math.round(w.temp_max))) + "°C</div><div>High</div></div>";
    wh += '<div class="weather-item"><div class="weather-val">💧 ' + escapeHtml(String(w.humidity)) + "%</div><div>Humidity</div></div>";
    wh += '<div class="weather-item"><div class="weather-val">🌧️ ' + escapeHtml(String(w.precip)) + "mm</div><div>Rain</div></div>";
    wh += '<div class="weather-item"><div class="weather-val">💨 ' + escapeHtml(String(Math.round(w.wind))) + "km/h</div><div>Wind</div></div>";
    wh += '<div class="weather-item"><div class="weather-val">☀️ ' + escapeHtml(String(w.uv)) + "</div><div>UV Index</div></div>";
    weatherDiv.innerHTML = wh;
    weatherDiv.style.display = "flex";
  } else {
    weatherDiv.style.display = "none";
  }
}

// ============================================================
// Badge Update (uses severity from utils.js)
// ============================================================

function updateBadge(today) {
  const sev = getSeverityFromIndex(today.index);
  if (sev.level >= 3) {
    const colors = { 3: "#f97316", 4: "#ef4444", 5: "#a855f7" };
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: colors[sev.level] || "#f97316" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

// ============================================================
// Settings View
// ============================================================

function openSettings() { renderZipList(); showView("settings"); }

function closeSettings() {
  if (currentLocations.length === 0) { showView("first-run"); }
  else { showView("current"); loadData(); }
}

function renderZipList() {
  const list = document.getElementById("zip-list");
  list.innerHTML = "";
  for (let i = 0; i < currentLocations.length; i++) {
    const loc = currentLocations[i];
    const item = document.createElement("div");
    item.className = "zip-item";
    let h = "";
    h += '<div class="zip-info">';
    h += '<span class="zip-code">' + escapeHtml(loc.zip) + "</span>";
    h += '<span class="zip-name">' + escapeHtml(loc.name) + ", " + escapeHtml(loc.admin) + "</span>";
    h += "</div>";
    h += '<button class="btn-delete" data-index="' + i + '" title="Remove">&#10005;</button>';
    item.innerHTML = h;
    list.appendChild(item);
  }
  const btns = list.querySelectorAll(".btn-delete");
  for (let j = 0; j < btns.length; j++) {
    btns[j].addEventListener("click", handleDelete);
  }
}

async function handleDelete(e) {
  const target = e.target.closest(".btn-delete");
  if (!target) { return; }
  const idx = parseInt(target.dataset.index, 10);
  currentLocations.splice(idx, 1);
  if (selectedIndex >= currentLocations.length) {
    selectedIndex = Math.max(0, currentLocations.length - 1);
  }
  await chrome.storage.local.set({ locations: currentLocations, selectedIndex: selectedIndex });
  populateSelect();
  renderZipList();
  if (currentLocations.length === 0) { showView("first-run"); }
}

// ============================================================
// Sidebar / Forecast
// ============================================================

async function openSidebar() {
  try {
    if (chrome.sidePanel) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs.length > 0) {
        await chrome.sidePanel.open({ tabId: tabs[0].id });
        return;
      }
    }
    openFallback();
  } catch (err) { openFallback(); }
}

function openFallback() {
  chrome.windows.create({
    url: chrome.runtime.getURL("sidebar.html"),
    type: "popup", width: 420, height: 650
  });
}