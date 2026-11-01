const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');

const isSmokeTest = process.argv.includes('--smoke-test');
global.isSmokeTest = isSmokeTest;

// Enable hardware acceleration and high-performance GPU for 3D WebGL & Soft-Body Physics
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('force_high_performance_gpu');

// Helper to create or ensure desktop shortcut exists on Windows
function createDesktopShortcut() {
  if (process.platform !== 'win32') return false;
  try {
    const desktopPath = app.getPath('desktop');
    const shortcutPath = path.join(desktopPath, 'Crashoria Ultimate Road Adventure.lnk');
    const targetPath = process.execPath;
    return shell.writeShortcutLink(shortcutPath, {
      target: targetPath,
      cwd: path.dirname(targetPath),
      description: 'Crashoria: Ultimate Road Adventure - BeamNG Soft-Body Highway Racing',
      icon: targetPath,
      iconIndex: 0
    });
  } catch (err) {
    console.error('Failed to create desktop shortcut:', err);
    return false;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    title: 'Crashoria: Ultimate Road Adventure - BeamNG Soft-Body Physics Edition v3.3.0',
    backgroundColor: '#040710',
    autoHideMenuBar: true,
    show: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      additionalArguments: isSmokeTest ? ['--smoke-test'] : []
    }
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[RENDERER_CONSOLE_${level}] ${message} (${sourceId}:${line})`);
  });

  win.webContents.on('did-finish-load', () => {
    if (isSmokeTest) {
      setTimeout(() => {
        try {
          win.webContents.send('run-smoke-test');
        } catch (e) {}
      }, 400);
    }
  });

  ipcMain.on('toggle-fullscreen', () => {
    win.setFullScreen(!win.isFullScreen());
  });

  ipcMain.on('quit-app', () => {
    app.quit();
  });

  // Desktop Shortcut creation IPC handler
  ipcMain.on('create-desktop-shortcut', (event) => {
    const ok = createDesktopShortcut();
    event.reply('create-desktop-shortcut-result', { ok });
  });

  // App Uninstallation IPC handler
  ipcMain.on('uninstall-app', (event) => {
    try {
      const exeDir = path.dirname(process.execPath);
      const candidates = [
        path.join(exeDir, 'Uninstall CrashoriaUltimateRoadAdventure.exe'),
        path.join(exeDir, 'Uninstall Crashoria.exe'),
        path.join(exeDir, 'Uninstall.exe'),
        path.join(exeDir, 'unins000.exe'),
        path.join(process.resourcesPath, '..', 'Uninstall CrashoriaUltimateRoadAdventure.exe'),
        path.join(process.resourcesPath, '..', 'Uninstall.exe')
      ];
      const foundUninstaller = candidates.find(p => fs.existsSync(p));
      if (foundUninstaller) {
        spawn(foundUninstaller, [], { detached: true, stdio: 'ignore' }).unref();
        app.quit();
      } else {
        // Fallback for Portable version: open Windows Apps & Features settings so user can manage/remove
        exec('start ms-settings:appsfeatures || control appwiz.cpl');
        event.reply('uninstall-app-result', { ok: true, launchedSettings: true });
      }
    } catch (err) {
      event.reply('uninstall-app-result', { ok: false, error: err.message });
    }
  });

  ipcMain.on('smoke-test-result', (_event, result) => {
    console.log('SMOKE_TEST_RESULT:', JSON.stringify(result));
    app.exit(result.ok ? 0 : 1);
  });
}

app.whenReady().then(() => {
  // Automatically ensure Desktop shortcut exists on first run
  try {
    const desktopPath = app.getPath('desktop');
    const shortcutPath = path.join(desktopPath, 'Crashoria Ultimate Road Adventure.lnk');
    if (!fs.existsSync(shortcutPath)) {
      createDesktopShortcut();
    }
  } catch (e) {}

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
