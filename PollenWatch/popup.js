// ============================================================
// PollenWatch - Popup Logic
// ============================================================

var CATEGORY_CONFIG = [
  { key: "tree_index",  label: "Tree",  icon: "🌳", category: "Tree" },
  { key: "grass_index", label: "Grass", icon: "🌾", category: "Grass" },
  { key: "weed_index",  label: "Weed",  icon: "🌿", category: "Weed" },
  { key: "mold_index",  label: "Mold",  icon: "🍄", category: "Mold" }
];

var currentLocations = [];
var selectedIndex = 0;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  var stored = await chrome.storage.local.get(["locations", "selectedIndex"]);
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

  document.getElementById("input-zip-first").addEventListener("keydown", function(e) {
    if (e.key === "Enter") { addZipFirst(); }
  });
  document.getElementById("input-zip").addEventListener("keydown", function(e) {
    if (e.key === "Enter") { addZipFromSettings(); }
  });
}

function showView(view) {
  var ids = ["loading", "error", "current", "settings", "first-run"];
  for (var i = 0; i < ids.length; i++) {
    document.getElementById(ids[i]).classList.add("hidden");
  }
  var hideBar = (view === "first-run" || view === "settings");
  document.getElementById("location-bar").classList.toggle("hidden", hideBar);
  document.getElementById(view).classList.remove("hidden");
}

function populateSelect() {
  var sel = document.getElementById("location-select");
  sel.innerHTML = "";
  for (var i = 0; i < currentLocations.length; i++) {
    var loc = currentLocations[i];
    var opt = document.createElement("option");
    opt.value = i;
    opt.textContent = loc.zip + " — " + loc.name + ", " + loc.admin;
    sel.appendChild(opt);
  }
  sel.value = selectedIndex;
}

function onLocationChange() {
  selectedIndex = parseInt(document.getElementById("location-select").value, 10);
  chrome.storage.local.set({ selectedIndex: selectedIndex });
  loadData();
}

async function addZipFirst() {
  await addZip(document.getElementById("input-zip-first"));
}

async function addZipFromSettings() {
  await addZip(document.getElementById("input-zip"));
  renderZipList();
  populateSelect();
}

async function addZip(inputEl) {
  var zip = inputEl.value.trim();
  if (!zip) { return; }
  for (var i = 0; i < currentLocations.length; i++) {
    if (currentLocations[i].zip === zip) {
      showError("This ZIP code is already added.");
      return;
    }
  }
  inputEl.value = "";
  showView("loading");

  var coords = await zipToCoords(zip);
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

function showError(msg) {
  document.getElementById("error-msg").textContent = msg;
  showView("error");
  setTimeout(function() {
    if (currentLocations.length > 0) { showView("current"); }
    else { showView("first-run"); }
  }, 3000);
}

async function loadData() {
  if (currentLocations.length === 0) { return; }
  showView("loading");

  try {
    var loc = currentLocations[selectedIndex];
    if (!loc) { showError("Invalid location."); return; }

    var pollenData = await fetchAllPollenData(loc.zip, loc.lat, loc.lon);
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
    console.error("PollenWatch loadData error:", err);
    showError("Failed to fetch data. Check your connection.");
  }
}

function renderCurrentView(pollenData) {
  var today = pollenData.today;

  // Overall banner
  var banner = document.getElementById("overall-banner");
  var sev = getSeverityFromIndex(today.index);
  banner.style.background = sev.bg;
  banner.style.border = "1px solid " + sev.color + "44";

  var bh = "";
  bh += '<div class="banner-index" style="color:' + sev.color + '">';
  bh += sev.emoji + " " + today.index + "/12";
  bh += '</div>';
  bh += '<div class="banner-label" style="color:' + sev.color + '">';
  bh += today.category + " Pollen Level";
  bh += '</div>';
  bh += '<div class="banner-scale">Overall pollen index (0-12 scale)</div>';
  banner.innerHTML = bh;

  // Category cards
  var grid = document.getElementById("cards-grid");
  grid.innerHTML = "";

  for (var i = 0; i < CATEGORY_CONFIG.length; i++) {
    var cfg = CATEGORY_CONFIG[i];
    var value = today[cfg.key] || 0;
    var cardSev = getSeverityFromIndex(value);
    var pct = Math.min((value / 12) * 100, 100);

    var card = document.createElement("div");
    card.className = "pollen-card";
    card.style.borderLeftColor = cardSev.color;

    var ch = "";
    ch += '<div class="card-header">';
    ch += '<span class="card-type">' + cfg.label + '</span>';
    ch += '<span class="card-emoji">' + cardSev.emoji + '</span>';
    ch += '</div>';
    ch += '<div class="card-value" style="color:' + cardSev.color + '">';
    ch += value + '</div>';
    ch += '<div class="card-label">' + cardSev.label + ' &middot; ' + cfg.icon + ' ' + cfg.category + '</div>';
    ch += '<div class="card-bar">';
    ch += '<div class="card-bar-fill" style="width:' + pct + '%;background:' + cardSev.color + '"></div>';
    ch += '</div>';

    card.innerHTML = ch;
    grid.appendChild(card);
  }

  // Triggers
  var triggersSection = document.getElementById("triggers-section");
  var triggersList = document.getElementById("triggers-list");
  var triggers = today.triggers || [];

  if (triggers.length > 0) {
    triggersSection.classList.remove("hidden");
    triggersList.innerHTML = "";
    for (var t = 0; t < triggers.length; t++) {
      var tr = triggers[t];
      var tagClass = "trigger-tag";
      var typeLower = (tr.type || "").toLowerCase();
      if (typeLower === "tree") { tagClass += " tree"; }
      else if (typeLower === "grass") { tagClass += " grass"; }
      else if (typeLower === "weed") { tagClass += " weed"; }
      else if (typeLower === "mold") { tagClass += " mold"; }

      var tag = document.createElement("span");
      tag.className = tagClass;
      tag.textContent = tr.name;
      triggersList.appendChild(tag);
    }
  } else {
    triggersSection.classList.add("hidden");
  }

  // Weather info
  var weatherDiv = document.getElementById("weather-info");
  var w = today.weather;
  if (w) {
    var wh = "";
    wh += '<div class="weather-item"><div class="weather-val">🌡️ ' + Math.round(w.temp_max) + '°C</div><div>High</div></div>';
    wh += '<div class="weather-item"><div class="weather-val">💧 ' + w.humidity + '%</div><div>Humidity</div></div>';
    wh += '<div class="weather-item"><div class="weather-val">🌧️ ' + w.precip + 'mm</div><div>Rain</div></div>';
    wh += '<div class="weather-item"><div class="weather-val">💨 ' + Math.round(w.wind) + 'km/h</div><div>Wind</div></div>';
    wh += '<div class="weather-item"><div class="weather-val">☀️ ' + w.uv + '</div><div>UV Index</div></div>';
    weatherDiv.innerHTML = wh;
    weatherDiv.style.display = "flex";
  } else {
    weatherDiv.style.display = "none";
  }
}

function updateBadge(today) {
  var sev = getSeverityFromIndex(today.index);
  if (sev.level >= 3) {
    var colors = { 3: "#f97316", 4: "#ef4444", 5: "#a855f7" };
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: colors[sev.level] || "#f97316" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

function openSettings() { renderZipList(); showView("settings"); }

function closeSettings() {
  if (currentLocations.length === 0) { showView("first-run"); }
  else { showView("current"); loadData(); }
}

function renderZipList() {
  var list = document.getElementById("zip-list");
  list.innerHTML = "";
  for (var i = 0; i < currentLocations.length; i++) {
    var loc = currentLocations[i];
    var item = document.createElement("div");
    item.className = "zip-item";
    var h = "";
    h += '<div class="zip-info">';
    h += '<span class="zip-code">' + loc.zip + '</span>';
    h += '<span class="zip-name">' + loc.name + ', ' + loc.admin + '</span>';
    h += '</div>';
    h += '<button class="btn-delete" data-index="' + i + '" title="Remove">&#10005;</button>';
    item.innerHTML = h;
    list.appendChild(item);
  }
  var btns = list.querySelectorAll(".btn-delete");
  for (var j = 0; j < btns.length; j++) {
    btns[j].addEventListener("click", handleDelete);
  }
}

async function handleDelete(e) {
  var target = e.target.closest(".btn-delete");
  if (!target) { return; }
  var idx = parseInt(target.dataset.index, 10);
  currentLocations.splice(idx, 1);
  if (selectedIndex >= currentLocations.length) {
    selectedIndex = Math.max(0, currentLocations.length - 1);
  }
  await chrome.storage.local.set({ locations: currentLocations, selectedIndex: selectedIndex });
  populateSelect();
  renderZipList();
  if (currentLocations.length === 0) { showView("first-run"); }
}

async function openSidebar() {
  try {
    if (chrome.sidePanel) {
      var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
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