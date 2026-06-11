# docs

Screenshots shown in the main [README](../README.md):

- `hero.jpg` — a sunlit meadow at midday.
- `night.jpg` — the same world after dark, with bioluminescent critters under the deep-space sky.

To refresh them: run the app, frame a nice moment (the 📷 Photo button hides the UI), and replace these
files. The in-canvas renderer keeps its drawing buffer, so a quick `canvas.toDataURL('image/png')` in the
console exports the current frame.
