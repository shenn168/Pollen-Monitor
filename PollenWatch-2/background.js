// ============================================================
// PollenWatch - Background Service Worker
// ============================================================

chrome.alarms.create("pollenRefresh", { periodInMinutes: 180 });

chrome.alarms.onAlarm.addListener(function(alarm) {
  if (alarm.name === "pollenRefresh") {
    refreshData();
  }
});

chrome.runtime.onInstalled.addListener(function() {
  console.log("PollenWatch installed.");
});

async function refreshData() {
  try {
    var stored = await chrome.storage.local.get(["locations", "selectedIndex"]);
    var locations = stored.locations || [];
    var idx = stored.selectedIndex || 0;
    if (locations.length === 0) { return; }
    if (idx >= locations.length) { idx = 0; }

    var loc = locations[idx];

    // Fetch weather-based estimate (always works for US)
    var url = "https://api.open-meteo.com/v1/forecast"
      + "?latitude=" + loc.lat
      + "&longitude=" + loc.lon
      + "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,relative_humidity_2m_max,relative_humidity_2m_min,uv_index_max"
      + "&timezone=auto"
      + "&forecast_days=7";

    var resp = await fetch(url);
    if (!resp.ok) { return; }
    var weather = await resp.json();

    if (!weather || !weather.daily || !weather.daily.time) { return; }

    var pollenData = estimatePollenFromWeatherBg(weather.daily);
    await chrome.storage.local.set({
      cachedPollenData: pollenData,
      cachedLocation: loc
    });

    // Update badge
    if (pollenData && pollenData.today) {
      var index = pollenData.today.index || 0;
      var level = 0;
      if (index > 9.6) { level = 5; }
      else if (index > 7.2) { level = 4; }
      else if (index > 4.8) { level = 3; }
      else if (index > 2.4) { level = 2; }
      else if (index > 0) { level = 1; }

      if (level >= 3) {
        var colors = { 3: "#f97316", 4: "#ef4444", 5: "#a855f7" };
        chrome.action.setBadgeText({ text: "!" });
        chrome.action.setBadgeBackgroundColor({ color: colors[level] || "#f97316" });
      } else {
        chrome.action.setBadgeText({ text: "" });
      }
    }

  } catch (err) {
    console.error("PollenWatch background refresh error:", err);
  }
}

function estimatePollenFromWeatherBg(daily) {
  var result = { todayValid: true, today: null, forecast: [] };

  var times = daily.time || [];
  var tempMax = daily.temperature_2m_max || [];
  var tempMin = daily.temperature_2m_min || [];
  var precip = daily.precipitation_sum || [];
  var wind = daily.wind_speed_10m_max || [];
  var humMax = daily.relative_humidity_2m_max || [];
  var humMin = daily.relative_humidity_2m_min || [];
  var uv = daily.uv_index_max || [];

  for (var i = 0; i < times.length; i++) {
    var tMax = tempMax[i] || 0;
    var tMin = tempMin[i] || 0;
    var rain = precip[i] || 0;
    var windSpd = wind[i] || 0;
    var avgTemp = (tMax + tMin) / 2;
    var avgHum = ((humMax[i] || 50) + (humMin[i] || 30)) / 2;
    var uvIdx = uv[i] || 0;

    var treeIndex = estimateBgIndex("tree", avgTemp, rain, windSpd, avgHum, uvIdx);
    var grassIndex = estimateBgIndex("grass", avgTemp, rain, windSpd, avgHum, uvIdx);
    var weedIndex = estimateBgIndex("weed", avgTemp, rain, windSpd, avgHum, uvIdx);
    var moldIndex = estimateBgMold(avgTemp, rain, avgHum);
    var overallIndex = Math.max(treeIndex, grassIndex, weedIndex, moldIndex);

    var entry = {
      date: times[i],
      index: Math.round(overallIndex * 10) / 10,
      category: getCategoryNameBg(overallIndex),
      tree_index: Math.round(treeIndex * 10) / 10,
      grass_index: Math.round(grassIndex * 10) / 10,
      weed_index: Math.round(weedIndex * 10) / 10,
      mold_index: Math.round(moldIndex * 10) / 10,
      weather: {
        temp_max: tMax, temp_min: tMin, precip: rain,
        wind: windSpd, humidity: Math.round(avgHum), uv: uvIdx
      },
      triggers: []
    };

    if (i === 0) { result.today = entry; }
    result.forecast.push(entry);
  }

  return result;
}

function estimateBgIndex(type, temp, rain, wind, humidity, uv) {
  var index = 0;
  if (type === "tree") {
    if (temp >= 10 && temp <= 30) { index += 2.5 + 1.5 * Math.min((temp - 10) / 15, 1); }
    else if (temp > 30) { index += 2.0; }
    else if (temp >= 5) { index += 1.0; }
  } else if (type === "grass") {
    if (temp >= 18 && temp <= 35) { index += 2.5 + 1.5 * Math.min((temp - 18) / 14, 1); }
    else if (temp >= 12) { index += 1.5; }
    else if (temp >= 5) { index += 0.5; }
  } else if (type === "weed") {
    if (temp >= 20 && temp <= 38) { index += 2.0 + 2.0 * Math.min((temp - 20) / 15, 1); }
    else if (temp >= 12) { index += 1.0; }
  }
  if (rain > 10) { index -= 3.0; } else if (rain > 5) { index -= 2.0; }
  else if (rain > 1) { index -= 1.0; } else if (rain <= 0.1) { index += 1.0; }
  if (wind >= 10 && wind <= 30) { index += 1.5; }
  else if (wind > 30) { index += 0.5; } else if (wind >= 5) { index += 1.0; }
  if (humidity < 40) { index += 1.0; } else if (humidity > 80) { index -= 1.0; }
  if (uv >= 5) { index += 1.5; } else if (uv >= 3) { index += 1.0; } else if (uv >= 1) { index += 0.5; }
  if (index < 0) { index = 0; }
  if (index > 12) { index = 12; }
  return index;
}

function estimateBgMold(temp, rain, humidity) {
  var index = 0;
  if (temp >= 15 && temp <= 35) { index += 2.0; } else if (temp >= 5) { index += 0.5; }
  if (humidity > 70) { index += 3.0; } else if (humidity > 55) { index += 2.0; }
  else if (humidity > 40) { index += 1.0; }
  if (rain > 5) { index += 2.5; } else if (rain > 1) { index += 1.5; }
  else if (rain > 0) { index += 0.5; }
  if (index < 0) { index = 0; }
  if (index > 12) { index = 12; }
  return index;
}

function getCategoryNameBg(index) {
  if (index <= 0) { return "None"; }
  if (index <= 2.4) { return "Low"; }
  if (index <= 4.8) { return "Moderate"; }
  if (index <= 7.2) { return "High"; }
  if (index <= 9.6) { return "Very High"; }
  return "Extreme";
}