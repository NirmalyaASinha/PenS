const { _electron: electron } = require('@playwright/test');
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

test.describe('PenS Electron App Tests', () => {
  let electronApp;
  let window;
  let testDataDir;

  test.beforeAll(async () => {
    // Create a temporary directory for isolated tests
    testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pens-test-'));
    
    // Launch the packaged executable if provided via ENV, otherwise fallback to development main.js
    const executablePath = process.env.PENS_EXE_PATH;
    const args = executablePath ? [] : [path.join(__dirname, '../main/main.js')];

    electronApp = await electron.launch({
      executablePath: executablePath || undefined,
      args,
      env: {
        ...process.env,
        // Attempt to redirect app.getPath('documents') indirectly by tricking the user profile
        USERPROFILE: testDataDir
      }
    });

    window = await electronApp.firstWindow();
  });

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close();
    }
    // Clean up test data
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  test('Application should launch and open Home page', async () => {
    // Check window title
    const title = await window.title();
    expect(title).toBe('PenS');

    // Wait for the address bar to be available
    const addressBar = window.locator('#address-bar');
    await expect(addressBar).toBeVisible();

    // The home page should be the active tab
    const activeTab = window.locator('.tab.active .tab-title');
    await expect(activeTab).toHaveText('Home');
  });

  test('Context Isolation and Node Integration should be secure', async () => {
    // Ensure Node integration is off and context isolation is on in the renderer
    const typeofRequire = await window.evaluate(() => typeof require);
    expect(typeofRequire).toBe('undefined');

    const typeofProcess = await window.evaluate(() => typeof process);
    expect(typeofProcess).toBe('undefined');
  });
});
