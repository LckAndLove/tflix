<div align="center">
  <img src="assets/tflix-banner.svg" alt="TFLIX" />
</div>

# TFLIX

TFLIX is a movie and TV discovery and streaming app powered by [TMDB](https://www.themoviedb.org/). Browse titles, view details, choose a streaming source, and watch in the app.

**Website:** [tflix.nunesnetwork.com](https://tflix.nunesnetwork.com/)

## Features

- Search and browse movies and TV shows using TMDB metadata
- View title details, artwork, ratings, release information, and episode descriptions
- Select a TV season and episode from the title page
- Choose from six streaming sources; the desktop app opens their player pages in a dedicated native WebView, while web and Android use iframes
- Resume recently watched titles using locally saved playback progress
- Change episodes and sources from the desktop player controls; use the custom subtitle panel on Ekko
- Open the current source and episode in your system browser from the source menu when the native player cannot play it
- Use the website, the Tauri desktop app, or the Android app for phones, tablets, and Android TV
- Block pop-up windows opened by embedded players in the desktop and Android apps

The app uses TMDB IDs to build provider player URLs. Playback availability and subtitle timing depend on the selected third-party source and its version of the title.

## Get TFLIX

### Website

Open [tflix.nunesnetwork.com](https://tflix.nunesnetwork.com/) in a browser. Website deployments are published through the GitHub Pages workflow.

### Desktop

Download the installer for macOS, Windows, or Linux from the [latest GitHub release](https://github.com/LckAndLove/tflix/releases/latest). The desktop app is built with Tauri and loads the bundled browsing interface. Playback opens in a separate native window that loads the provider directly, without a TFLIX iframe or loopback server. Closing that window returns to the title details. Playback failures and loading states are handled by the provider; TFLIX does not probe availability or switch sources automatically.

See the [native playback notes](docs/native-playback.md) for the architecture and validation status.

### Android

Download the APK from the [latest GitHub release](https://github.com/LckAndLove/tflix/releases/latest) and install it on an Android phone, tablet, or Android TV device. See the [Android app guide](app/android/README.md) for installation and build details.

## Run locally

Requirements: Node.js, Rust, and the platform dependencies required by Tauri 2. The web interface also needs a TMDB read access token. Set `TMDB_TOKEN` to use your own token; the UI preparation script can use the project's configured read token when the variable is not set.

```bash
npm install
npm run tauri dev
```

Build a desktop bundle with:

```bash
npm run tauri build
```

The Tauri configuration prepares the web interface in `ui/` before running or building the desktop app. Android build instructions are in [app/android/README.md](app/android/README.md).

## Tech stack

- HTML, CSS, and JavaScript for the web interface
- [Tauri 2](https://tauri.app/) and Rust for the desktop application and player integration
- Kotlin and Android WebView for the Android application
- [TMDB API](https://developer.themoviedb.org/docs)
- GitHub Actions for website deployment and desktop/Android release builds

## Related project

[TMDB-Player](https://github.com/TomasTNunes/TMDB-Player) is a browser extension for playing titles from the TMDB website.
