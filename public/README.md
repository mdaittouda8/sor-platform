# public/

Place your Excel data file here. The dashboard tries these filenames in order:

1. `ertms.xlsx`  ← **recommended**
2. `Suivi_des_déconnexions_ERTMS_et_actions_correctives.xlsx`
3. `data.xlsx`

Files in this folder are served at the root of the site (e.g. `public/ertms.xlsx` → `http://localhost:5173/ertms.xlsx`). They are **not** imported or bundled — they're copied as-is into `dist/` at build time.

If no file is found, the dashboard shows a banner prompting you to pick the file manually from your computer.
