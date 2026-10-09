# App versioning

The app version comes from `package.json`. Electron exposes it through `app.getVersion()` and the `get-app-version` IPC handler. The sidebar displays the installed version even when an update notification is present.

After committing your changes, run `npm version patch -m "chore: release v%s"` for a bug release or `npm version minor -m "chore: release v%s"` for a feature release. npm updates `package.json` and `package-lock.json`, creates a commit, and adds a version tag. Restart the development app to see the new version, or run `npm run package:mac` to build an installer containing it. An already installed app keeps its version until replaced by the new build.
