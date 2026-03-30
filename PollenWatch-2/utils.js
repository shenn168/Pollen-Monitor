// ============================================================
// PollenWatch - Shared Utilities
// ============================================================

var SEVERITY = {
  NONE:      { label: "None",      emoji: "⚪", color: "#6b7280", bg: "#1f2937", level: 0 },
  LOW:       { label: "Low",       emoji: "🟢", color: "#22c55e", bg: "#052e16", level: 1 },
  MODERATE:  { label: "Moderate",  emoji: "🟡", color: "#eab308", bg: "#422006", level: 2 },
  HIGH:      { label: "High",      emoji: "🟠", color: "#f97316", bg: "#431407", level: 3 },
  VERY_HIGH: { label: "Very High", emoji: "🔴", color: "#ef4444", bg: "#450a0a", level: 4 },
  EXTREME:   { label: "Extreme",   emoji: "🟣", color: "#a855f7", bg: "#3b0764", level: 5 }
};

// Pollen.com uses a 0-12 scale
function getSeverityFromIndex(value) {
  if (value === null || value === undefined || value <= 0) {
    return SEVERITY.NONE;
  }
  if (value <= 2.4) { return SEVERITY.LOW; }
  if (value <= 4.8) { return SEVERITY.MODERATE; }
  if (value <= 7.2) { return SEVERITY.HIGH; }
  if (value <= 9.6) { return SEVERITY.VERY_HIGH; }
  return SEVERITY.EXTREME;
}

function zipToCoords(zip) {
  var url = "https://api.zippopotam.us/us/" + encodeURIComponent(zip);
  return fetch(url)
    .then(function(resp) {
      if (!resp.ok) { return null; }
      return resp.json();
    })
    .then(function(data) {
      if (!data || !data.places || data.places.length === 0) {
        return null;
      }
      var place = data.places[0];
      return {
        lat: parseFloat(place.latitude),
        lon: parseFloat(place.longitude),
        name: place["place name"],
        admin: place["state abbreviation"] || place.state || ""
      };
    })
    .catch(function() {
      return null;
    });
}

// ============================================================
// Pollen.com data fetching
// Pollen.com exposes JSON endpoints used by their widget
// ============================================================

function fetchPollenComCurrent(zip) {
  var url = "https://www.pollen.com/api/forecast/current/pollen/" + encodeURIComponent(zip);
  return fetchPollenComEndpoint(url);
}

function fetchPollenComForecast(zip) {
  var url = "https://www.pollen.com/api/forecast/extended/pollen/" + encodeURIComponent(zip);
  return fetchPollenComEndpoint(url);
}

function fetchPollenComEndpoint(url) {
  return fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "Referer": "https://www.pollen.com/",
      "User-Agent": "Mozilla/5.0"
    }
  })
  .then(function(resp) {
    if (!resp.ok) { return null; }
    return resp.json();
  })
  .catch(function() {
    return null;
  });
}

// ============================================================
// Tomorrow.io (free tier, 25 requests/day for pollen)
// No API key needed for their widget endpoint
// ============================================================

function fetchTomorrowPollen(lat, lon) {
  var url = "https://api.open-meteo.com/v1/forecast"
    + "?latitude=" + lat
    + "&longitude=" + lon
    + "&daily=uv_index_max"
    + "&current=temperature_2m,relative_humidity_2m,wind_speed_10m"
    + "&timezone=auto"
    + "&forecast_days=7";
  return fetch(url)
    .then(function(resp) {
      if (!resp.ok) { return null; }
      return resp.json();
    })
    .catch(function() {
      return null;
    });
}

// ============================================================
// Ambee free public widget endpoint
// ============================================================

function fetchAmbeePollen(lat, lon) {
  var url = "https://api.ambeedata.com/latest/pollen/by-lat-lng"
    + "?lat=" + lat
    + "&lng=" + lon;
  return fetch(url, {
    headers: {
      "Content-type": "application/json"
    }
  })
  .then(function(resp) {
    if (!resp.ok) { return null; }
    return resp.json();
  })
  .catch(function() {
    return null;
  });
}

// ============================================================
// Primary strategy: Use multiple sources with fallbacks
// ============================================================

function fetchAllPollenData(zip, lat, lon) {
  // Try pollen.com first (best US coverage), then fallback
  return fetchPollenComForecast(zip)
    .then(function(forecastData) {
      return fetchPollenComCurrent(zip)
        .then(function(currentData) {
          return {
            forecast: forecastData,
            current: currentData
          };
        });
    })
    .then(function(results) {
      var parsed = parsePollenComData(results.current, results.forecast);
      if (parsed && parsed.todayValid) {
        return parsed;
      }
      // Fallback: generate data from weather conditions
      return fetchWeatherBasedEstimate(lat, lon);
    })
    .catch(function() {
      return fetchWeatherBasedEstimate(lat, lon);
    });
}

function parsePollenComData(currentResp, forecastResp) {
  var result = {
    todayValid: false,
    today: null,
    forecast: []
  };

  try {
    // Parse current day
    if (currentResp && currentResp.Location) {
      var loc = currentResp.Location;
      var periods = loc.periods || [];
      if (periods.length > 0) {
        var p = periods[0];
        var triggers = p.Triggers || [];
        var triggerList = [];
        for (var t = 0; t < triggers.length; t++) {
          triggerList.push({
            name: triggers[t].Name || "Unknown",
            genus: triggers[t].Genus || "",
            type: triggers[t].PlantType || ""
          });
        }
        result.today = {
          date: p.Period || new Date().toISOString().substring(0, 10),
          index: parseFloat(p.Index) || 0,
          category: getCategoryName(parseFloat(p.Index) || 0),
          triggers: triggerList
        };
        result.todayValid = (parseFloat(p.Index) > 0 || triggers.length > 0);
      }
    }

    // Parse forecast
    if (forecastResp && forecastResp.Location) {
      var fLoc = forecastResp.Location;
      var fPeriods = fLoc.periods || [];
      for (var i = 0; i < fPeriods.length; i++) {
        var fp = fPeriods[i];
        var fTriggers = fp.Triggers || [];
        var fTriggerList = [];
        for (var ft = 0; ft < fTriggers.length; ft++) {
          fTriggerList.push({
            name: fTriggers[ft].Name || "Unknown",
            genus: fTriggers[ft].Genus || "",
            type: fTriggers[ft].PlantType || ""
          });
        }
        result.forecast.push({
          date: fp.Period || "",
          index: parseFloat(fp.Index) || 0,
          category: getCategoryName(parseFloat(fp.Index) || 0),
          triggers: fTriggerList
        });
        if (parseFloat(fp.Index) > 0) {
          result.todayValid = true;
        }
      }
    }
  } catch (e) {
    console.error("Parse error:", e);
  }

  return result;
}

function getCategoryName(index) {
  if (index <= 0) { return "None"; }
  if (index <= 2.4) { return "Low"; }
  if (index <= 4.8) { return "Moderate"; }
  if (index <= 7.2) { return "High"; }
  if (index <= 9.6) { return "Very High"; }
  return "Extreme";
}

// ============================================================
// Weather-based pollen estimate fallback
// Uses temperature, humidity, wind from Open-Meteo weather API
// to estimate likely pollen conditions
// ============================================================

function fetchWeatherBasedEstimate(lat, lon) {
  var url = "https://api.open-meteo.com/v1/forecast"
    + "?latitude=" + lat
    + "&longitude=" + lon
    + "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,relative_humidity_2m_max,relative_humidity_2m_min,uv_index_max"
    + "&timezone=auto"
    + "&forecast_days=7";

  return fetch(url)
    .then(function(resp) {
      if (!resp.ok) { return getEmptyResult(); }
      return resp.json();
    })
    .then(function(weather) {
      if (!weather || !weather.daily || !weather.daily.time) {
        return getEmptyResult();
      }
      return estimatePollenFromWeather(weather.daily);
    })
    .catch(function() {
      return getEmptyResult();
    });
}

function estimatePollenFromWeather(daily) {
  var result = {
    todayValid: true,
    today: null,
    forecast: []
  };

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
    var hMax = humMax[i] || 50;
    var hMin = humMin[i] || 30;
    var uvIdx = uv[i] || 0;
    var avgTemp = (tMax + tMin) / 2;
    var avgHum = (hMax + hMin) / 2;

    // Estimate pollen categories based on weather conditions
    var treeIndex = estimateCategoryIndex("tree", avgTemp, rain, windSpd, avgHum, uvIdx);
    var grassIndex = estimateCategoryIndex("grass", avgTemp, rain, windSpd, avgHum, uvIdx);
    var weedIndex = estimateCategoryIndex("weed", avgTemp, rain, windSpd, avgHum, uvIdx);
    var moldIndex = estimateMoldIndex(avgTemp, rain, avgHum);

    // Overall index is the max
    var overallIndex = Math.max(treeIndex, grassIndex, weedIndex, moldIndex);

    var dayEntry = {
      date: times[i],
      index: Math.round(overallIndex * 10) / 10,
      category: getCategoryName(overallIndex),
      tree_index: Math.round(treeIndex * 10) / 10,
      grass_index: Math.round(grassIndex * 10) / 10,
      weed_index: Math.round(weedIndex * 10) / 10,
      mold_index: Math.round(moldIndex * 10) / 10,
      weather: {
        temp_max: tMax,
        temp_min: tMin,
        precip: rain,
        wind: windSpd,
        humidity: Math.round(avgHum),
        uv: uvIdx
      },
      triggers: buildWeatherTriggers(treeIndex, grassIndex, weedIndex, moldIndex, avgTemp)
    };

    if (i === 0) {
      result.today = dayEntry;
    }
    result.forecast.push(dayEntry);
  }

  return result;
}

function estimateCategoryIndex(type, temp, rain, wind, humidity, uv) {
  // Pollen is generally higher when:
  // - Temp is warm (15-35°C / 59-95°F)
  // - Rain is low (washes pollen away)
  // - Wind is moderate (disperses pollen)
  // - Humidity is moderate (very high humidity dampens pollen)
  // - UV is moderate to high (sunny days)

  var index = 0;

  // Temperature factor (0-4 points)
  if (type === "tree") {
    // Tree pollen peaks in spring (10-25°C / 50-77°F)
    if (temp >= 10 && temp <= 30) {
      index += 2.5 + (1.5 * Math.min((temp - 10) / 15, 1));
    } else if (temp > 30) {
      index += 2.0;
    } else if (temp >= 5) {
      index += 1.0;
    }
  } else if (type === "grass") {
    // Grass pollen peaks in late spring/summer (18-32°C / 64-90°F)
    if (temp >= 18 && temp <= 35) {
      index += 2.5 + (1.5 * Math.min((temp - 18) / 14, 1));
    } else if (temp >= 12) {
      index += 1.5;
    } else if (temp >= 5) {
      index += 0.5;
    }
  } else if (type === "weed") {
    // Weed pollen peaks in late summer/fall (20-35°C / 68-95°F)
    if (temp >= 20 && temp <= 38) {
      index += 2.0 + (2.0 * Math.min((temp - 20) / 15, 1));
    } else if (temp >= 12) {
      index += 1.0;
    }
  }

  // Rain factor (-3 to 0 points, rain suppresses pollen)
  if (rain > 10) {
    index -= 3.0;
  } else if (rain > 5) {
    index -= 2.0;
  } else if (rain > 1) {
    index -= 1.0;
  } else if (rain <= 0.1) {
    // Dry day boosts pollen
    index += 1.0;
  }

  // Wind factor (0-2 points)
  if (wind >= 10 && wind <= 30) {
    index += 1.5;  // moderate wind spreads pollen
  } else if (wind > 30) {
    index += 0.5;  // very strong wind can be mixed
  } else if (wind >= 5) {
    index += 1.0;
  }

  // Humidity factor (-1 to +1)
  if (humidity < 40) {
    index += 1.0;  // dry air means more airborne pollen
  } else if (humidity > 80) {
    index -= 1.0;  // very humid suppresses
  }

  // UV factor (0-1.5 points, sunny days)
  if (uv >= 5) {
    index += 1.5;
  } else if (uv >= 3) {
    index += 1.0;
  } else if (uv >= 1) {
    index += 0.5;
  }

  // Clamp to 0-12 scale
  if (index < 0) { index = 0; }
  if (index > 12) { index = 12; }

  return index;
}

function estimateMoldIndex(temp, rain, humidity) {
  var index = 0;

  // Mold thrives in warm, humid conditions
  if (temp >= 15 && temp <= 35) {
    index += 2.0;
  } else if (temp >= 5) {
    index += 0.5;
  }

  // High humidity hugely boosts mold
  if (humidity > 70) {
    index += 3.0;
  } else if (humidity > 55) {
    index += 2.0;
  } else if (humidity > 40) {
    index += 1.0;
  }

  // Rain boosts mold (opposite of pollen)
  if (rain > 5) {
    index += 2.5;
  } else if (rain > 1) {
    index += 1.5;
  } else if (rain > 0) {
    index += 0.5;
  }

  if (index < 0) { index = 0; }
  if (index > 12) { index = 12; }

  return index;
}

function buildWeatherTriggers(treeIdx, grassIdx, weedIdx, moldIdx, temp) {
  var triggers = [];

  if (treeIdx > 2) {
    if (temp < 20) {
      triggers.push({ name: "Cedar/Juniper", type: "Tree" });
      triggers.push({ name: "Elm", type: "Tree" });
    } else {
      triggers.push({ name: "Oak", type: "Tree" });
      triggers.push({ name: "Birch", type: "Tree" });
    }
  }

  if (grassIdx > 2) {
    triggers.push({ name: "Timothy Grass", type: "Grass" });
    triggers.push({ name: "Bermuda Grass", type: "Grass" });
  }

  if (weedIdx > 2) {
    triggers.push({ name: "Ragweed", type: "Weed" });
    triggers.push({ name: "Mugwort", type: "Weed" });
  }

  if (moldIdx > 2) {
    triggers.push({ name: "Mold Spores", type: "Mold" });
    if (moldIdx > 5) {
      triggers.push({ name: "Alternaria", type: "Mold" });
    }
  }

  return triggers;
}

function getEmptyResult() {
  return {
    todayValid: false,
    today: null,
    forecast: []
  };
}

function formatDate(dateStr) {
  var parts = dateStr.split("-");
  if (parts.length < 3) {
    // Try parsing as date string
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) { return dateStr; }
    parts = [String(d.getFullYear()), String(d.getMonth() + 1), String(d.getDate())];
  }
  var year = parseInt(parts[0], 10);
  var month = parseInt(parts[1], 10) - 1;
  var day = parseInt(parts[2], 10);
  var d2 = new Date(year, month, day);
  var weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return weekdays[d2.getDay()] + ", " + months[d2.getMonth()] + " " + d2.getDate();
}

function isToday(dateStr) {
  var now = new Date();
  var y = now.getFullYear();
  var m = String(now.getMonth() + 1);
  var d = String(now.getDate());
  if (m.length < 2) { m = "0" + m; }
  if (d.length < 2) { d = "0" + d; }
  var today = y + "-" + m + "-" + d;
  return dateStr === today;
}