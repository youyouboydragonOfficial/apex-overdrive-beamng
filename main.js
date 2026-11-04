const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');

const isSmokeTest = process.argv.includes('--smoke-test');
global.isSmokeTest = isSmokeTest;

// Enable hardware acceleration and high-performance GPU for 3D WebGL & Soft-Body Physics
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('force_high_performance_gpu');
// Unrestricted Web Audio Autoplay Policy for Seamless BGM & SFX
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-features', 'PreloadMediaEngagementData');

// Helper to inspect application environment (Portable vs Installed)
function getAppInfo() {
  const exeDir = path.dirname(process.execPath);
  const candidates = [
    path.join(exeDir, 'Uninstall CrashoriaUltimateRoadAdventure.exe'),
    path.join(exeDir, 'Uninstall Crashoria Ultimate Road Adventure.exe'),
    path.join(exeDir, 'Uninstall Crashoria.exe'),
    path.join(exeDir, 'Uninstall.exe'),
    path.join(exeDir, 'unins000.exe'),
    path.join(process.resourcesPath, '..', 'Uninstall CrashoriaUltimateRoadAdventure.exe'),
    path.join(process.resourcesPath, '..', 'Uninstall Crashoria Ultimate Road Adventure.exe'),
    path.join(process.resourcesPath, '..', 'Uninstall Crashoria.exe'),
    path.join(process.resourcesPath, '..', 'Uninstall.exe')
  ];

  // Dynamically inspect exe directory for any uninstaller executable
  try {
    if (fs.existsSync(exeDir)) {
      const files = fs.readdirSync(exeDir);
      for (const f of files) {
        if (/^unins.*\.exe$/i.test(f) || /^uninstall.*\.exe$/i.test(f)) {
          const fullP = path.join(exeDir, f);
          if (!candidates.includes(fullP)) candidates.push(fullP);
        }
      }
    }
  } catch (e) {}

  const foundUninstaller = candidates.find(p => fs.existsSync(p));
  const portableExe = process.env.PORTABLE_EXECUTABLE_FILE ||
    (process.execPath.toLowerCase().includes('portable') ? process.execPath : null);
  const isPortable = Boolean(portableExe || !foundUninstaller);
  return {
    isPortable,
    portableExePath: portableExe || process.execPath,
    hasUninstaller: Boolean(foundUninstaller),
    uninstallerPath: foundUninstaller || null,
    userDataPath: app.getPath('userData')
  };
}

// Helper to create or ensure desktop shortcut exists on Windows
function createDesktopShortcut() {
  if (process.platform !== 'win32') return false;
  try {
    const desktopPath = app.getPath('desktop');
    const shortcutPath = path.join(desktopPath, 'Crashoria Ultimate Road Adventure.lnk');
    const info = getAppInfo();
    const targetPath = info.portableExePath || process.execPath;
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

let mainWindow = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    title: 'Crashoria: Ultimate Road Adventure - BeamNG Soft-Body Physics Edition v3.5.1',
    backgroundColor: '#040710',
    autoHideMenuBar: true,
    show: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      autoplayPolicy: 'no-user-gesture-required',
      additionalArguments: isSmokeTest ? ['--smoke-test'] : []
    }
  });

  mainWindow = win;

  win.once('ready-to-show', () => {
    win.show();
  });

  // Fallback so window always shows even if ready-to-show is delayed
  setTimeout(() => {
    if (win && !win.isDestroyed() && !win.isVisible()) {
      win.show();
    }
  }, 1000);

  win.on('minimize', () => {
    try {
      win.webContents.send('app-window-state', 'minimized');
    } catch (e) {}
  });

  win.on('restore', () => {
    try {
      win.webContents.send('app-window-state', 'restored');
    } catch (e) {}
  });

  win.on('close', () => {
    try {
      win.webContents.send('app-window-state', 'closing');
    } catch (e) {}
  });

  win.on('closed', () => {
    mainWindow = null;
    app.exit(0);
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
    app.exit(0);
  });

  // Query app environment info (Portable vs Installed)
  ipcMain.handle('get-app-info', async () => {
    return getAppInfo();
  });
  ipcMain.on('get-app-info', (event) => {
    event.reply('get-app-info-result', getAppInfo());
  });

  // Desktop Shortcut creation IPC handler
  ipcMain.on('create-desktop-shortcut', (event) => {
    const ok = createDesktopShortcut();
    event.reply('create-desktop-shortcut-result', { ok });
  });

  // Open the folder containing the portable executable in File Explorer
  ipcMain.on('open-portable-folder', (event) => {
    try {
      const info = getAppInfo();
      const target = info.portableExePath;
      if (win) {
        win.setAlwaysOnTop(false);
      }
      if (fs.existsSync(target)) {
        shell.showItemInFolder(target);
        event.reply('open-portable-folder-result', { ok: true, path: target });
      } else {
        shell.openPath(path.dirname(target));
        event.reply('open-portable-folder-result', { ok: true, path: path.dirname(target) });
      }
    } catch (err) {
      event.reply('open-portable-folder-result', { ok: false, error: err.message });
    }
  });

  // Self-delete portable executable and quit
  ipcMain.on('delete-portable-app', (event) => {
    try {
      const info = getAppInfo();
      const targetFile = info.portableExePath;
      const userData = info.userDataPath;
      // Minimize window so any system prompts are shown in front
      if (win) {
        win.setAlwaysOnTop(false);
        win.minimize();
      }
      // Spawn hidden detached cmd to wait 2 seconds after quit, delete portable exe, and clean up userData folder
      const cleanupCmd = `timeout /t 2 /nobreak >nul & del /f /q "${targetFile}" & rmdir /s /q "${userData}"`;
      spawn('cmd.exe', ['/c', cleanupCmd], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      setTimeout(() => {
        app.quit();
      }, 300);
    } catch (err) {
      event.reply('delete-portable-app-result', { ok: false, error: err.message });
    }
  });

  // Clear all data and reset
  ipcMain.on('clear-all-data', (event) => {
    try {
      if (win && win.webContents && win.webContents.session) {
        win.webContents.session.clearStorageData();
      }
      event.reply('clear-all-data-result', { ok: true });
    } catch (err) {
      event.reply('clear-all-data-result', { ok: false, error: err.message });
    }
  });

  // App Uninstallation IPC handler (NSIS uninstaller)
  ipcMain.on('uninstall-app', (event) => {
    try {
      const info = getAppInfo();
      // Minimize window immediately so uninstaller or Windows Settings is 100% in the foreground
      if (win) {
        win.setAlwaysOnTop(false);
        win.minimize();
      }

      if (info.hasUninstaller && info.uninstallerPath) {
        spawn(info.uninstallerPath, [], { detached: true, stdio: 'ignore' }).unref();
        setTimeout(() => {
          app.quit();
        }, 400);
      } else {
        // Fallback for Portable/Unpackaged: launch Windows Apps & Features settings in front
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

const gotTheLock = isSmokeTest ? true : app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  if (!isSmokeTest) {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
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
    app.exit(0);
  });
}
