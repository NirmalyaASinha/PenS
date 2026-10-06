# Versioning

PenS uses Semantic Versioning (`MAJOR.MINOR.PATCH`) from the `version` field in
`package.json`. Never reuse a published version number.

The permanent Windows application identity, selected before the first public
release, is:

- App ID: `com.nirmalyasinha.pens`
- NSIS installer GUID: `E8F3C92B-4A71-4E1D-9B67-94751A2E8B99`

These values must not change after the first public release. The first tester
build is `1.0.0-rc.1`; the stable release will be `1.0.0` after sign-off.
User data is stored
under `Documents\PenNotebook`, outside the installation directory, so upgrades
replace program files without removing notes or settings.

Builds are unsigned unless `CSC_LINK` (and, when required, `CSC_KEY_PASSWORD`)
are supplied. Unsigned builds are suitable for local testing but may show an
Unknown Publisher SmartScreen warning. Signing configuration must never be
committed.
