# PenS Release Checklist and Code Signing Guide

## Task 6.2: Code Signing (Authenticode) for an Indian Developer

**What is Authenticode Code Signing?**
It is a cryptographic signature applied to your `.exe` files to prove they were created by you and haven't been tampered with.

**Options and Costs for an Individual Developer in India:**
1. **Standard Code Signing (OV - Organization/Individual Validated):**
   - **Cost:** ~$70 to $120 USD per year (~₹6,000 to ₹10,000 INR).
   - **Identity Proof:** You must provide government ID (Passport, Aadhaar/PAN translated/notarized, or a utility bill) and jump through hoops for verification.
   - **Form factor:** Since 2023, industry rules mandate that keys must be stored on a physical USB hardware token, or a cloud HSM (Azure Key Vault). This adds shipping costs to India (often another $30-$50) or monthly cloud fees.
2. **EV Code Signing (Extended Validation):**
   - **Cost:** $300+ USD/year. Requires a registered company (Pvt Ltd, LLP, etc.). Not feasible for an individual hobbyist.

**The SmartScreen Reality (What signing DOES NOT fix):**
Even if you spend ₹10,000 on a Standard Code Signing certificate and sign your app, **Windows SmartScreen will still block your app with a blue "Windows protected your PC" warning.** 
Why? Because Standard certs require "reputation" to bypass SmartScreen. Reputation is built over time as thousands of users download your app without reporting it as malware. *Only EV certs bypass SmartScreen instantly*, and those are out of reach for individuals.

**Recommendation:** If this is a free/hobby app, **don't buy a certificate**. Save your money. Tell your users to click "More Info -> Run anyway." If you plan to sell it commercially, incorporate a company and get an EV cert, or buy a Standard cert and endure the initial SmartScreen warnings until you build reputation.

**How to sign (if you buy a cert):**
Keep your keys OUT of the repository. Encode your certificate as a base64 string and add it to GitHub Secrets as `WIN_CERTIFICATE_BASE64`, and put the password in `WIN_CERTIFICATE_PASSWORD`. `electron-builder` automatically uses them.

---

## Release Checklist

- [ ] **1. Code and Dependency Audit**
  - Run `npm audit --omit=dev`. Ensure 0 critical/high vulnerabilities.
  - Review `SECURITY.md` IPC inventory for any new channels.
- [ ] **2. Local Testing**
  - Verify app launches: `npm start`.
  - Drop `security-test.html` into the browser and confirm it blocks attacks.
- [ ] **3. Version Bump**
  - Update `version` in `package.json`.
  - Run `npm ci` to ensure `package-lock.json` matches exactly.
- [ ] **4. Tag and Push**
  - Commit changes: `git commit -am "Release v1.0.1"`
  - Tag the commit: `git tag v1.0.1`
  - Push: `git push origin main --tags`
- [ ] **5. CI Pipeline Monitors**
  - Wait for GitHub Actions to trigger.
  - Ensure the pipeline completes (it will apply Electron Fuses, run `electron-builder` with `asar: true`, strip dev maps, and build NSIS & Portable executables).
  - Verify `checksums.txt` is uploaded to the GitHub Release.
- [ ] **6. Auto-Updater Verification**
  - Open the *previous* version of the app to confirm it detects the new release, verifies the publisher signature (if signed), and updates safely.

