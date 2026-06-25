# Heroes of Cerulea — Hero Sheet (Owlbear Rodeo extension)

A per-player hero sheet for the *Heroes of Cerulea* RPG, built for Owlbear Rodeo (v2+).
Each player gets one hero, saved to their own player profile in the room — so it
persists across sessions and only that player edits it.

## Files
- `manifest.json` — extension manifest Owlbear reads
- `index.html` / `style.css` / `sheet.js` — the sheet UI and logic
- `icon.svg` — toolbar icon (the Trinity)

## What it tracks
Hero / Player / Kin / Special / Hair / Clothes, the three attributes
(Might, Bravery, Insight) with steppers, Hearts and Energy pip trackers
(tap a pip to set the spent/remaining edge; +/- to change max), Gems / Keys /
Snacks / Meals / Trinity Fragments / Bombs, an 8-slot inventory (4 unlocked,
unlock all 8 with the Large Pouch toggle), the action list, plus Export to JSON.

## How to install (hosting required)
Owlbear loads extensions from a public HTTPS URL, so the files need to be hosted.

### Option A — quickest (Netlify Drop)
1. Go to https://app.netlify.com/drop
2. Drag this whole folder onto the page. It returns a URL like
   `https://your-name.netlify.app`.
3. Your manifest URL is `https://your-name.netlify.app/manifest.json`.

### Option B — GitHub Pages
1. Push this folder to a GitHub repo.
2. Settings → Pages → deploy from the `main` branch root.
3. Manifest URL: `https://<user>.github.io/<repo>/manifest.json`.

### Add it to Owlbear
1. Open Owlbear Rodeo → a room → the **Extensions** menu (puzzle-piece icon).
2. Choose **Add Custom Extension**.
3. Paste your `manifest.json` URL and add it.
4. A "Hero Sheet" button appears in the room toolbar. Click it to open the sheet.

## Local testing
Serve the folder over http (not file://, because of the ES module import):
    python3 -m http.server 8000
then open http://localhost:8000 . Outside Owlbear it runs in "offline mode" and
saves to your browser's localStorage; inside an Owlbear room it auto-upgrades to
saving in your player profile.

## Notes / customizing
- Saved data lives under the metadata key `rodeo.cerulea.heroSheet/v1` (in `sheet.js`).
- The default hero matches the rulebook's starting hero: attributes 1/1/1
  (distribute your 3/2/1 with the steppers), 3 Hearts, 3 Energy, 15 gems.
- The SDK is imported from esm.sh at runtime; if that ever fails to load, the
  sheet still works and falls back to local saving.
