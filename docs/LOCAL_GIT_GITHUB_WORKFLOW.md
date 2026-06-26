# Local Git And GitHub Workflow

This guide explains how to manage the Wafer Post-Processing Suite from your local folder and sync it to GitHub.

Repository:
- [https://github.com/zimmxx/cs-testsuite](https://github.com/zimmxx/cs-testsuite)

Live site:
- [https://zimmxx.github.io/cs-testsuite/](https://zimmxx.github.io/cs-testsuite/)

## Daily Workflow

### 1. Open the local project folder

Project folder:
- `C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App`

### 2. Check current Git status

```bash
git status
```

This shows:

- modified files
- new files
- deleted files
- whether your branch is ahead or behind GitHub

### 3. Run the app locally

```bash
pnpm dev
```

### 4. Review your changes

```bash
git diff
```

### 5. Stage the files you want to save

Stage everything:

```bash
git add .
```

Stage only specific files:

```bash
git add src/App.jsx src/styles.css README.md
```

### 6. Create a commit

```bash
git commit -m "Describe the change clearly"
```

Examples:

```bash
git commit -m "Improve wafermap layout and fit panel"
git commit -m "Add manual Excel normalization rules"
git commit -m "Update v0.1.1 feature documentation"
```

### 7. Push to GitHub

```bash
git push origin main
```

After pushing to `main`, GitHub Actions will automatically rebuild and redeploy the app.

## Useful Git Commands

Check branch:

```bash
git branch
```

See commit history:

```bash
git log --oneline --decorate --graph -20
```

Fetch latest remote info:

```bash
git fetch origin
```

Pull latest changes:

```bash
git pull origin main
```

## Suggested Branch Workflow For Bigger Changes

For small edits, working directly on `main` is okay if you are the only maintainer.

For larger upgrades, use a branch:

```bash
git checkout -b feature/report-export-upgrade
```

Then:

```bash
git add .
git commit -m "Add report export improvements"
git push origin feature/report-export-upgrade
```

After that, open a pull request on GitHub if you want review before merging.

## Deployment Flow

The deployment workflow lives in:

- [deploy-pages.yml](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\.github\workflows\deploy-pages.yml)

Deployment process:

1. Push code to GitHub
2. GitHub Actions runs the Pages workflow
3. The app is built from source
4. The built `dist/` output is published to GitHub Pages

## What To Edit For Common Tasks

Change layout or UI:
- [src/App.jsx](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\src\App.jsx)
- [src/styles.css](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\src\styles.css)

Change parser behavior:
- [src/lib/parsers.js](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\src\lib\parsers.js)

Change analysis formulas:
- [src/lib/analysis.js](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\src\lib\analysis.js)

Update docs:
- [README.md](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\README.md)
- [docs](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\docs\LOCAL_GIT_GITHUB_WORKFLOW.md)

## Recommended Commit Style

Keep commit messages short and specific:

- `Add XLSX column mapping improvements`
- `Refine propagation chart styling`
- `Document v0.1.0 features`
- `Fix GitHub Pages workflow`

## Notes About Local Files

Some files in the project root are older standalone HTML experiments. The deployed app does not depend on them.

Examples:

- `Wafer-PostProcessing-Suite.html`
- `Wafer-PostProcessing-Suite-Offline.html`
- `Wafer-PostProcessing-Suite-Edge-Working.html`
- `Wafer-PostProcessing-Suite-Direct.html`

The real maintained app is the React/Vite app under `src/`.
