# Companion Release Packaging

## Understanding summary

- GitHub releases provide the NinjaCrawler Companion as a ZIP for manual installation.
- The Companion keeps the independent version declared in its `manifest.json`.
- The archive contains only runtime files and user documentation.
- The existing release workflow publishes the archive and its SHA-256 checksum.

## Design

`Tools/Package-NinjaCrawlerRelease.ps1` validates the Companion manifest and
required files, stages the distributable contents, and creates
`NinjaCrawler-Companion-<version>.zip`. The archive has a single versioned root
folder so extracting multiple versions does not mix their files.

JavaScript test files are excluded. The archive is added to the same asset list
used for `SHA256SUMS.txt`; the release workflow already uploads every file from
the output directory.

The packaging script supports a Companion-only mode so CI can verify the archive
layout and checksum without compiling the desktop application.

## Decision log

1. **ZIP distribution.** Off-store CRX signing and browser-store publication are
   outside the current scope.
2. **Independent version.** The asset name uses the manifest version rather than
   the desktop release version.
3. **Shared packager.** Desktop and Companion assets use one release script and
   one checksum file.
4. **Runtime-only contents.** Extension tests remain in source control but are
   omitted from published archives.
