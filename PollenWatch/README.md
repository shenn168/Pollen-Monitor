# 🌿 PollenWatch — Browser Extension

**Free pollen, mold & allergen counts and forecasts by ZIP code.**

PollenWatch is a lightweight Microsoft Edge browser extension that provides real-time pollen, mold, and allergen level estimates and multi-day forecasts — all without requiring any API keys.

---

## 📸 Features

- **Real-time pollen levels** — Tree, Grass, Weed, and Mold indices on a 0–12 scale
- **Color-coded severity** — Instant visual indicators (⚪ None → 🟢 Low → 🟡 Moderate → 🟠 High → 🔴 Very High → 🟣 Extreme)
- **5–7 day forecast** — Detailed daily breakdown in a sidebar/panel view
- **Top allergen triggers** — Shows likely allergens based on current conditions (e.g., Oak, Ragweed, Mold Spores)
- **Weather context** — Displays temperature, humidity, rain, wind, and UV index alongside pollen data
- **Multiple ZIP codes** — Save and switch between home, work, or any US location
- **Badge notifications** — Extension icon shows a warning badge (!) when pollen levels are HIGH or above
- **Auto-refresh** — Background data refresh every 3 hours
- **Dark theme** — Sleek, modern dark UI designed for quick glances
- **No API keys required** — Uses only free, public data sources

---

## 🏗️ Architecture

### Data Sources (Free, No API Key)

| Source | Purpose | Coverage |
|---|---|---|
| [Zippopotam.us](http://www.zippopotam.us/) | ZIP code → latitude/longitude geocoding | US ZIP codes |
| [Open-Meteo Weather API](https://open-meteo.com/) | Daily weather forecast (temp, humidity, rain, wind, UV) | Global |
| [Pollen.com](https://www.pollen.com/) | Direct pollen index and allergen triggers (attempted first) | US |

### Pollen Estimation Model

When direct pollen data is unavailable (common for many US locations), PollenWatch uses a **weather-based estimation model** that calculates pollen and mold indices from environmental conditions:

- **Temperature** — Warm days increase pollen; each category (tree, grass, weed) has optimal temperature ranges
- **Rainfall** — Rain suppresses airborne pollen but increases mold spore counts
- **Wind** — Moderate wind disperses pollen; calm days have lower counts
- **Humidity** — Dry air keeps pollen airborne; high humidity dampens pollen but boosts mold
- **UV Index** — Sunny days correlate with higher pollen release

All indices are normalized to a **0–12 scale** consistent with industry-standard pollen reporting.

---

## 📁 File Structure

PollenWatch/ ├── manifest.json # Extension manifest (Manifest V3) ├── popup.html # Main popup UI ├── popup.css # Popup styles (dark theme) ├── popup.js # Popup logic and rendering ├── sidebar.html # Sidebar/panel forecast view ├── sidebar.css # Sidebar styles ├── sidebar.js # Sidebar forecast logic ├── background.js # Service worker (auto-refresh, badge updates) ├── utils.js # Shared utilities (APIs, severity calc, estimation model) ├── README.md # This file └── icons/ ├── icon16.png # Toolbar icon (16x16) ├── icon48.png # Extension page icon (48x48) └── icon128.png # Store/detail icon (128x128)

---

## 🚀 Installation

### Prerequisites

- **Microsoft Edge** (Chromium-based, version 110+)
- Developer mode enabled

### Steps

1. **Download or clone** this repository to a local folder:
git clone https://github.com/your-username/pollenwatch.git

Or download and extract the ZIP file.

2. **Generate icons** (if not already present):
- Open the included `create_icons.html` file in any browser
- Three icon files (`icon16.png`, `icon48.png`, `icon128.png`) will auto-download
- Move them into the `icons/` subfolder

3. **Load the extension in Edge:**
- Open Edge and navigate to `edge://extensions/`
- Enable **Developer mode** (toggle in the bottom-left corner)
- Click **"Load unpacked"**
- Select the `PollenWatch` folder

4. **Pin the extension:**
- Click the puzzle piece icon (🧩) in the Edge toolbar
- Click the pin icon next to **PollenWatch**

5. **Start using:**
- Click the 🌿 PollenWatch icon in your toolbar
- Enter your ZIP code and click **Get Started**

---

## 🖥️ Usage Guide

### Viewing Current Levels

1. Click the **PollenWatch** icon in your toolbar
2. The popup shows:
- **Overall pollen index** (0–12 scale with color/emoji)
- **Category breakdown** — Tree, Grass, Weed, Mold cards
- **Top allergens** — Likely triggers for the day
- **Weather conditions** — Temperature, humidity, rain, wind, UV

### Viewing the Forecast

1. Click the **📅 View 5-Day Forecast** button in the popup
2. A sidebar panel (or popup window) opens with:
- Daily pollen index for up to 7 days
- Per-category breakdown (Tree, Grass, Weed, Mold)
- Allergen trigger tags
- Weather summary per day

### Managing Locations

1. Click the **⚙️** settings icon in the popup header
2. **Add** a new ZIP code using the input field
3. **Remove** a location by clicking the ✕ button
4. **Switch** between locations using the dropdown selector
5. Click **← Back** to return to the main view

### Badge Notifications

- The extension icon displays a colored **!** badge when pollen levels are HIGH or above:
- 🟠 **Orange** — High
- 🔴 **Red** — Very High
- 🟣 **Purple** — Extreme
- The badge clears automatically when levels drop below HIGH

---

## 📊 Severity Scale

| Level | Index Range | Emoji | Color | Description |
|---|---|---|---|---|
| None | 0 | ⚪ | Gray | No significant allergens detected |
| Low | 0.1 – 2.4 | 🟢 | Green | Minimal impact for most people |
| Moderate | 2.5 – 4.8 | 🟡 | Yellow | May affect sensitive individuals |
| High | 4.9 – 7.2 | 🟠 | Orange | Many allergy sufferers affected |
| Very High | 7.3 – 9.6 | 🔴 | Red | Most allergy sufferers affected |
| Extreme | 9.7 – 12.0 | 🟣 | Purple | Severe impact; avoid outdoor exposure |

---

## ⚙️ Technical Details

### Manifest Version

- **Manifest V3** (latest Chrome/Edge extension standard)

### Permissions

| Permission | Reason |
|---|---|
| `storage` | Save user locations and cached pollen data locally |
| `alarms` | Schedule background data refresh every 3 hours |

### Host Permissions

| Domain | Reason |
|---|---|
| `api.open-meteo.com` | Weather forecast data |
| `api.zippopotam.us` | ZIP code geocoding |
| `www.pollen.com` | Direct pollen data (when available) |
| `api.ambeedata.com` | Future expansion for additional pollen data |

### Data Refresh

- **Manual:** Click the 🔄 refresh button in the popup
- **Automatic:** Background service worker refreshes every **3 hours**
- **On open:** Data is fetched fresh each time you open the popup

### Data Storage

All data is stored **locally** on your device via `chrome.storage.local`:
- Saved locations (ZIP, coordinates, name)
- Cached pollen data (for sidebar access)
- Selected location index

**No data is sent to any third-party server.** All API calls go directly to the public data sources listed above.

---

## 🔮 Future Enhancements

- [ ] Additional data sources (Google Pollen API, Ambee API with optional user key)
- [ ] Actual pollen station count data integration
- [ ] Historical pollen data comparison
- [ ] Allergy symptom tracker / diary
- [ ] Push notifications for high pollen alerts
- [ ] Support for international postal codes
- [ ] Light theme / theme toggle
- [ ] Custom severity thresholds
- [ ] Export data to CSV
- [ ] Chrome Web Store / Edge Add-ons publishing

---

## 🐛 Troubleshooting

### Extension shows "No pollen data available"

- Ensure you entered a valid **US ZIP code** (5 digits)
- Check your internet connection
- Click the 🔄 refresh button
- Open Edge DevTools (F12 → Console) on the popup to check for errors

### All values show zero

- This can happen if the weather API returns no data for your area
- Try a nearby major city's ZIP code
- Click refresh after a few minutes

### Sidebar doesn't open

- Edge version 117+ supports `chrome.sidePanel`
- For older Edge versions, the forecast opens in a small popup window instead
- This is expected behavior and fully functional

### Icons are missing

- Run the `create_icons.html` file in a browser to generate icon PNGs
- Ensure the icons are placed in the `icons/` subfolder
- Reload the extension from `edge://extensions/`

---

## 📄 License

This project is provided as-is for personal and educational use. The extension uses only free, publicly available APIs and does not collect any user data.

---

## 🙏 Acknowledgments

- [Open-Meteo](https://open-meteo.com/) — Free weather API (no key required)
- [Zippopotam.us](http://www.zippopotam.us/) — Free ZIP code geocoding API
- [Pollen.com](https://www.pollen.com/) — Pollen forecast reference data

---

**Built with ❤️ for allergy sufferers everywhere.**