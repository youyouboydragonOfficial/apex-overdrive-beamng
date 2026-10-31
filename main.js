const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const isSmokeTest = process.argv.includes('--smoke-test');
global.isSmokeTest = isSmokeTest;

// Enable hardware acceleration and high-performance GPU for 3D WebGL & Soft-Body Physics
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('force_high_performance_gpu');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    title: 'Crashoria: Ultimate Road Adventure - BeamNG Soft-Body Physics Edition v3.1.1',
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

  ipcMain.on('smoke-test-result', (_event, result) => {
    console.log('SMOKE_TEST_RESULT:', JSON.stringify(result));
    app.exit(result.ok ? 0 : 1);
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
