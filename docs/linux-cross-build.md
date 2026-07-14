# Linux cross-build contract

## Current hosted path

NinjaCrawler targets Windows x64 while CI builds on GitHub-hosted `ubuntu-latest`.
`Tools/Build-NinjaCrawler.ps1` keeps the Visual Studio/MSVC path for local Windows
builds and selects `cargo-xwin --target x86_64-pc-windows-msvc` on Linux.

The fixed Linux toolchain is:

- Rust stable and `cargo-xwin` 0.22.0;
- Node.js 22;
- LLVM/Clang/LLD 18.1.3 and NSIS 3.09 from Ubuntu 24.04;
- PowerShell Core for repository scripts.

The target directory defaults to
`src-tauri/target/x86_64-pc-windows-msvc/release`. When `CARGO_TARGET_DIR` is
set, the build wrapper resolves the executable and bundles below that directory
instead. A full build produces the raw PE and an NSIS bundle. MSI is
intentionally unsupported because WiX remains a Windows-only path.

## Release contract

An app release contains exactly these public assets:

- `NinjaCrawler-<version>-windows-x64-portable.exe`;
- `NinjaCrawler-<version>-windows-x64-setup.exe`;
- `CHANGELOG.md`;
- `SHA256SUMS.txt`, covering the other three files.

The portable artifact is the renamed `ninjacrawler.exe`, not a ZIP. It contains
neither a README nor connector executables. Portable means no installer; the app
still stores state in `%LOCALAPPDATA%\NinjaCrawler` and requires internet during
first-run connector preparation.

## Connector preparation

The connector catalog pins the required versions in `connectors/manifest.json`.
On Windows, the app obtains the pinned GitHub release asset, requires the
Release Assets API `digest` field to contain a SHA-256 value, verifies the
download, probes `--version`, and atomically activates it below
`%LOCALAPPDATA%\NinjaCrawler\connectors`.

Missing digests, hash mismatches, invalid archives, failed probes, and interrupted
downloads fail closed. A failed staging file never becomes active. Existing
managed installs are reused. A custom executable counts as ready only after its
explicit path passes the version probe; connector discovery through `PATH` is
not supported.

## Workflow security boundary

Pull requests opened by repository owners, organization members, or explicit
collaborators execute the cross-build on the ephemeral Proxmox JIT runner. PRs
from every other author association, including public forks, remain on the
hosted runner. Both paths use read-only repository permissions,
`persist-credentials: false`, and no build secrets. Trusted pushes to `main` and
manual CI dispatches also use the JIT runner; the job is skipped for manual
dispatches against any other ref. The release workflow separates concerns:

1. `build` checks out the trusted release ref, compiles and uploads an Actions
   artifact with read-only permissions;
2. `publish` downloads that artifact and is the only job granted
   `contents: write`.

`Windows cross-build validation` is a main-only manual dispatch on the Proxmox
JIT runner. It builds portable plus NSIS, rejects ZIP/MSI artifacts, validates
checksums, and never publishes a release. The official release build remains on
`ubuntu-latest` until this complete NSIS validation succeeds on the JIT runner;
publication remains hosted regardless of the build runner.

## Proxmox JIT validation

`Cross-build on Proxmox JIT runner` is an isolated manual workflow for the
first trusted LXC test. It requests the labels `self-hosted`, `proxmox-lxc`,
`crossbuild`, and `mode-ephemeral`, verifies the preinstalled golden toolchain,
and builds only the thin versioned portable executable. It does not download or
package connector runtimes, receive repository secrets, or publish a release.
The regular CI workflow may use the same runner labels for trusted collaborator
pull requests, but never for PRs from unknown author associations.

Each trusted workflow has a separate stable `CARGO_TARGET_DIR`, protected by
workflow concurrency without cancellation so two compiler processes cannot
write to the same target at the same time. The workspace and JIT runner remain
disposable. Manual JIT jobs explicitly require `refs/heads/main`.

Keep the orchestrator in ephemeral mode, inspect the uploaded PE and checksum
on Windows, and confirm that each JIT LXC is removed while only the intended
build cache persists. The orchestrator must accept CI jobs only when GitHub has
already selected the restricted self-hosted labels.

The LXC must never:

- execute PR code from an author association other than `OWNER`, `MEMBER`, or
  `COLLABORATOR`;
- receive publication credentials or repository secrets;
- publish a GitHub Release;
- belong to a runner group shared with unrelated repositories or workflows.

Restrict its runner group to this repository and the intended build workflows.
Keep external and public-fork PR cross-builds hosted, and keep publication on a
GitHub-hosted job. A Windows machine remains required for the final runtime
check: launch both distribution forms, complete first-run preparation, restart
without downloads, and exercise all three connectors.
