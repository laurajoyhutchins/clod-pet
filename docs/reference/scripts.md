# Scripts reference

Clod Pet separates ordinary source installation, local development, development-only signing, and release packaging. No ordinary script requires an execution-policy bypass or administrator rights.

## Windows scripts

| Script | Purpose | Host trust changes |
|---|---|---|
| `install.ps1` | Deterministic per-user source build, launcher, and optional Start Menu shortcut | None |
| `uninstall.ps1` | Idempotent removal of generated source-install files | Exact legacy cleanup only |
| `bootstrap-dev.ps1` | Locked dependency install, TypeScript build, and Go tests | None |
| `dev-signing.ps1` | Explicit development-only signing with a current-user self-signed certificate | Opt-in certificate creation in `CurrentUser\My`; never trusted automatically |
| `cleanup-dev-signing.ps1` | Remove one exact development certificate | Removes only an unambiguous exact match |
| `package-release.ps1` | Release packaging and signing with a pre-existing certificate thumbprint | Never creates or imports a certificate |
| `build.ps1` | Rebuild backend and app | None |
| `test.ps1` | Run backend, app, and E2E tests | None |
| `test-scripts.ps1` | Run Pester tests for script helpers and security decisions | None |

## Safe source installation

```powershell
pwsh -NoProfile -File .\scripts\install.ps1
```

The script requires Go, Node.js, npm, and `app/package-lock.json`. It uses `npm ci`, builds the Go executable and TypeScript output, then writes a per-user launcher and shortcut. Repeated runs are supported.

The source installer does not:

- request elevation;
- modify Defender, firewall, browser, or operating-system settings;
- create, import, or trust certificates;
- change PowerShell execution policy;
- write credentials or provider configuration;
- terminate processes;
- pass `--no-sandbox` to Electron.

Its log at `%TEMP%\clodpet-install.log` records step names and error types, not credentials or absolute user paths.

Optional parameters:

- `-SkipShortcut` — do not create a Start Menu shortcut.
- `-AppDataRoot <path>` — override the per-user state root for isolated tests.
- `-TempRoot <path>` — override the log root for isolated tests.

## Safe uninstallation

```powershell
pwsh -NoProfile -File .\scripts\uninstall.ps1
```

The uninstaller removes the shortcut, source launcher, and generated backend executable. It preserves settings by default.

- `-RemoveUserData` explicitly removes the settings file.
- `-SkipLegacySecurityCleanup` skips inspection for historical project-created Defender and certificate artifacts.

Legacy cleanup is deliberately narrow. It removes only the exact historical `backend\bin` Defender exclusion and only one exact current-user self-signed code-signing certificate named `CN=ClodPet Dev` with friendly name `ClodPet Dev Cert`. If selection is ambiguous, cleanup stops without removing anything.

## Local development

```powershell
pwsh -NoProfile -File .\scripts\bootstrap-dev.ps1
cd app
npm run dev
```

Development bootstrap does not call the installer, signing, packaging, or host-security helpers.

## Development-only signing

```powershell
pwsh -NoProfile -File .\scripts\dev-signing.ps1 -CreateCertificate -ArtifactPath .\path\to\artifact.exe
```

`-CreateCertificate` is an explicit opt-in. The certificate is stored only in `Cert:\CurrentUser\My`, is not added to Trusted Publishers or a root store, and expires after one year.

Cleanup:

```powershell
pwsh -NoProfile -File .\scripts\cleanup-dev-signing.ps1
```

## Release packaging and signing

```powershell
pwsh -NoProfile -File .\scripts\package-release.ps1 -CertificateThumbprint <40-hex-thumbprint>
```

The release script requires `signtool.exe`, `electron-builder`, and a pre-existing current-user certificate with an accessible private key. It never creates, imports, exports, or logs signing material.

## Tests

```powershell
pwsh -NoProfile -File .\scripts\test-scripts.ps1
pwsh -NoProfile -File .\scripts\test.ps1 all
```

The security workflow also runs repeated source installation and uninstallation in an isolated user-state directory, compares Defender exclusions and current-user certificate thumbprints before and after installation, and starts the built backend to verify a loopback-only listener.

## Unix build and test scripts

```bash
scripts/build.sh
scripts/test.sh [backend|app|e2e|all]
```

Unix scripts build and test the application but do not implement Windows installation or signing behavior.
