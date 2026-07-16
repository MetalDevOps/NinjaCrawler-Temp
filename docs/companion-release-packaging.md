# Companion Release Packaging

## Understanding summary

- GitHub releases provide the NinjaCrawler Companion as a ZIP for manual installation.
- The Companion version is declared in its `manifest.json` and is versioned on an
  independent Release Please track (`companion-vX.Y.Z`).
- Each **desktop app release** (`vX.Y.Z`) also co-ships the Companion ZIP from the
  release commit tree, so operators who only open the app release still get the
  extension that matched that build.
- The archive contains only runtime files and user documentation.

## Design

`Tools/Package-NinjaCrawlerRelease.ps1` validates the Companion manifest and
required files, stages the distributable contents, and creates
`NinjaCrawler-Companion-<version>.zip`. The archive has a stable
`NinjaCrawler-Companion` root folder so a new release can be extracted over the
existing unpacked extension directory.

JavaScript test files are excluded. Icons and non-test sources under `src/` are
included. The archive is added to the same asset list used for `SHA256SUMS.txt`.

### Two publication paths

1. **App release (`release.yml`)**  
   Packages portable + setup + Companion ZIP + changelog. The Companion version
   is read from `NinjaCrawler.Companion/manifest.json` at the app release SHA
   (not forced to equal the app version). Provenance records
   `companionVersion` (schema 2).

2. **Companion-only release (`release-companion.yml`)**  
   Packages with `-CompanionOnly` under tag `companion-vX.Y.Z`. This remains the
   canonical source for in-app update download URLs so an extension fix does not
   require a full desktop release.

Release Please keeps separate tracks so Companion-only commits never bump the
desktop version and app-only commits never bump the extension.

The packaging script supports Companion-only mode so CI can verify the archive
layout and checksum without compiling the desktop application. `-SkipCompanion`
remains available for local app-only packaging experiments.

README download links use independent markers:

- `<!-- ninjacrawler-release-* -->` for app assets under `vX.Y.Z`
- `<!-- ninjacrawler-companion-release-* -->` for Companion assets under
  `companion-vX.Y.Z`

`Tools/Update-NinjaCrawlerReleaseReadme.ps1` updates either or both. App publish
refreshes both; Companion publish refreshes only Companion blocks.

## Decision log

1. **ZIP distribution.** Off-store CRX signing and browser-store publication are
   outside the current scope.
2. **Stable unpacked identity.** The manifest includes a fixed public key and
   the ZIP uses a stable root folder. Together they prevent each extracted
   release from becoming a second Chrome extension.
3. **Manifest-driven version.** The asset name uses the manifest version read at
   packaging time.
4. **Shared packager.** Desktop and Companion assets use one release script and
   one checksum file when co-shipped.
5. **Runtime-only contents.** Extension tests remain in source control but are
   omitted from published archives.
6. **Independent version tracks + co-ship on app release.** Tracks stay
   independent to avoid update nag and forced bumps; app releases still attach
   the tree Companion for a complete download surface.
7. **In-app URLs stay on `companion-v*`.** Extension update links continue to
   target the Companion track even when the same ZIP is also attached to the
   desktop release.
