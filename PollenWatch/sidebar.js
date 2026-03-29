// ============================================================
// PollenWatch - Sidebar Logic
// ============================================================

var SIDEBAR_CATEGORIES = [
  { key: "tree_index",  label: "Tree",  icon: "🌳" },
  { key: "grass_index", label: "Grass", icon: "🌾" },
  { key: "weed_index",  label: "Weed",  icon: "🌿" },
  { key: "mold_index",  label: "Mold",  icon: "🍄" }
];

document.addEventListener("DOMContentLoaded", loadForecast);

async function loadForecast() {
  var loading = document.getElementById("sidebar-loading");
  var container = document.getElementById("forecast-container");
  var locEl = document.getElementById("sidebar-location");
  var errorEl = document.getElementById("sidebar-error");

  loading.classList.remove("hidden");
  container.innerHTML = "";

  try {
    var stored = await chrome.storage.local.get([
      "cachedPollenData", "cachedLocation", "locations", "selectedIndex"
    ]);

    var pollenData = stored.cachedPollenData || null;
    var loc = stored.cachedLocation || null;

    // If no cached data, fetch fresh
    if (!pollenData || !loc) {
      var locations = stored.locations || [];
      var selIdx = stored.selectedIndex || 0;
      if (locations.length === 0) {
        loading.classList.add("hidden");
        errorEl.textContent = "No locations set. Add a ZIP code in the popup.";
        errorEl.classList.remove("hidden");
        return;
      }
      if (selIdx >= locations.length) { selIdx = 0; }
      loc = locations[selIdx];
      pollenData = await fetchAllPollenData(loc.zip, loc.lat, loc.lon);
    }

    if (!pollenData || !pollenData.forecast || pollenData.forecast.length === 0) {
      loading.classList.add("hidden");
      errorEl.textContent = "No forecast data available for this location.";
      errorEl.classList.remove("hidden");
      return;
    }

    locEl.textContent = "📍 " + loc.name + ", " + loc.admin + " (" + loc.zip + ")";

    var forecast = pollenData.forecast;
    var daysToShow = Math.min(forecast.length, 7);

    for (var d = 0; d < daysToShow; d++) {
      var day = forecast[d];
      var today = isToday(day.date);
      var overallSev = getSeverityFromIndex(day.index);

      // Build category chips
      var chipsHTML = "";
      for (var c = 0; c < SIDEBAR_CATEGORIES.length; c++) {
        var cat = SIDEBAR_CATEGORIES[c];
        var val = day[cat.key] || 0;
        var chipSev = getSeverityFromIndex(val);
        var pct = Math.min((val / 12) * 100, 100);

        chipsHTML += '<div class="allergen-chip">';
        chipsHTML += '<span class="chip-icon">' + cat.icon + '</span>';
        chipsHTML += '<span class="chip-label">' + cat.label + '</span>';
        chipsHTML += '<span class="chip-value" style="color:' + chipSev.color + '">';
        chipsHTML += val + '</span>';
        chipsHTML += '<span class="chip-severity" style="color:' + chipSev.color + '">';
        chipsHTML += chipSev.label + '</span>';
        chipsHTML += '<div class="chip-bar">';
        chipsHTML += '<div class="chip-bar-fill" style="width:' + pct + '%;background:' + chipSev.color + '">';
        chipsHTML += '</div>';
        chipsHTML += '</div>';
        chipsHTML += '</div>';
      }

      // Build trigger tags
      var triggersHTML = "";
      var triggers = day.triggers || [];
      if (triggers.length > 0) {
        triggersHTML += '<div class="day-triggers">';
        for (var t = 0; t < triggers.length; t++) {
          var tr = triggers[t];
          var typeLower = (tr.type || "").toLowerCase();
          triggersHTML += '<span class="trigger-tag ' + typeLower + '">';
          triggersHTML += tr.name + '</span>';
        }
        triggersHTML += '</div>';
      }

      // Weather summary
      var weatherHTML = "";
      if (day.weather) {
        var w = day.weather;
        weatherHTML += '<div class="day-weather">';
        weatherHTML += '🌡️' + Math.round(w.temp_max) + '°/' + Math.round(w.temp_min) + '°C';
        weatherHTML += ' &nbsp; 💧' + w.humidity + '%';
        weatherHTML += ' &nbsp; 🌧️' + w.precip + 'mm';
        weatherHTML += '</div>';
      }

      // Assemble block
      var block = document.createElement("div");
      block.className = "forecast-day";
      if (today) { block.className += " today"; }

      var todayBadge = "";
      if (today) { todayBadge = '<span class="today-badge">Today</span>'; }

      var blockHTML = "";
      blockHTML += '<div class="day-header">';
      blockHTML += '<span class="day-date">' + formatDate(day.date) + todayBadge + '</span>';
      blockHTML += '<span class="day-overall-score" style="color:' + overallSev.color + '">';
      blockHTML += overallSev.emoji + ' ' + day.index + '/12</span>';
      blockHTML += '</div>';
      blockHTML += '<div class="day-allergens">' + chipsHTML + '</div>';
      blockHTML += triggersHTML;
      blockHTML += weatherHTML;

      block.innerHTML = blockHTML;
      container.appendChild(block);
    }

    loading.classList.add("hidden");

  } catch (err) {
    console.error("PollenWatch sidebar error:", err);
    loading.classList.add("hidden");
    errorEl.textContent = "Error loading forecast data.";
    errorEl.classList.remove("hidden");
  }
}