# Pushing this repo

The build was produced in a cloud session that had no credential for
`nncceducation-cpu/TENDER`, so the commits are here but unpushed. One command
finishes it.

## From Windows (PowerShell or Git Bash)

```
cd $HOME\Downloads\TENDER
git push -u origin main
```

That is the whole thing. `origin` is already set, the branch is `main`, and there
are 14 commits.

## Check it worked

```
git log --oneline origin/main | head -3
```

## If git asks for credentials

Use the GitHub CLI once, then push:

```
gh auth login
git push -u origin main
```

## Then set the project up

```
npm install
npm run fetch:models
npm run verify
npm run dev
```

`fetch:models` stages the MediaPipe WASM bundle and the pinned face landmarker
into `public/models/`, which is gitignored on purpose. The WASM alone is about
35 MB and does not belong in git history. The model is pinned by SHA-256, so the
script fails loudly if the bytes ever change.
