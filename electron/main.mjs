import { app, BrowserWindow, dialog, ipcMain, safeStorage } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rendererPath = path.join(__dirname, '..', 'dist', 'renderer', 'index.html');
const rendererDirectoryUrl = pathToFileURL(path.dirname(rendererPath) + path.sep).href;
const configureExistingMacProxy = () => {
  if (process.env.NODE_USE_ENV_PROXY === '1' || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY)
    return;
  if (process.platform !== 'darwin') return;
  try {
    const proxy = execFileSync('/usr/sbin/scutil', ['--proxy'], { encoding: 'utf8', timeout: 1500 });
    const enabled = /HTTPSEnable\s*:\s*1/.test(proxy) || /HTTPEnable\s*:\s*1/.test(proxy);
    const host = proxy.match(/HTTPSProxy\s*:\s*(\S+)/)?.[1] ?? proxy.match(/HTTPProxy\s*:\s*(\S+)/)?.[1];
    const port = proxy.match(/HTTPSPort\s*:\s*(\d+)/)?.[1] ?? proxy.match(/HTTPPort\s*:\s*(\d+)/)?.[1];
    if (enabled && host && port) {
      const endpoint = `http://${host}:${port}`;
      process.env.HTTPS_PROXY = endpoint;
      process.env.HTTP_PROXY = endpoint;
      process.env.NODE_USE_ENV_PROXY = '1';
    }
  } catch {
    // 代理探测失败时保持直连，连接状态由设置页显示。
  }
};
configureExistingMacProxy();
const startupLog = (message) => {
  try { appendFileSync(path.join(app.getPath('userData'), 'startup-diagnostics.log'), `[${new Date().toISOString()}] ${message}\n`, 'utf8'); } catch { /* 诊断失败不应阻断启动 */ }
};

const createWindow = () => {
  const preloadPath = path.join(__dirname, 'preload.cjs');
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#101319',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const developmentUrl = process.env.VITE_DEV_SERVER_URL;
  const developmentOrigin = developmentUrl ? new URL(developmentUrl).origin : undefined;
  const isAllowedNavigation = (url) => developmentOrigin
    ? url === developmentOrigin || url.startsWith(`${developmentOrigin}/`)
    : url.startsWith(rendererDirectoryUrl);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) event.preventDefault();
  });
  window.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const csp = developmentOrigin
      ? `default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ${developmentOrigin} ws://127.0.0.1:* ws://localhost:*; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
    const responseHeaders = Object.fromEntries(
      Object.entries(details.responseHeaders).filter(([key]) => key.toLowerCase() !== 'content-security-policy'),
    );
    callback({ responseHeaders: { ...responseHeaders, 'Content-Security-Policy': [csp] } });
  });
  if (developmentUrl) {
    window.loadURL(developmentUrl);
  } else {
    window.loadFile(rendererPath);
  }
  window.webContents.on('did-finish-load', () => startupLog('渲染页加载完成。'));
  window.webContents.on('did-fail-load', (_event, code, description, url) => startupLog(`页面加载失败：${code} ${description} ${url}`));
  window.webContents.on('console-message', (_event, level, message, line, sourceId) => startupLog(`渲染控制台[${level}] ${sourceId}:${line} ${message}`));
  window.webContents.on('render-process-gone', (_event, details) => startupLog(`渲染进程退出：${details.reason}，退出码 ${details.exitCode}`));
};

let runtime;

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
    startupLog('检测到重复启动请求，已聚焦当前唯一窗口。');
  });

app.whenReady().then(async () => {
  startupLog('主进程已就绪，开始初始化运行时。');
  const runtimePath = path.join(__dirname, '..', 'dist', 'electron', 'runtime.mjs');
  const { createStudioRuntime } = await import(pathToFileURL(runtimePath).href);
  runtime = createStudioRuntime(app.getPath('userData'), {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (value) => safeStorage.encryptString(value).toString('base64'),
    decrypt: (value) => safeStorage.decryptString(Buffer.from(value, 'base64'))
  });
  runtime.register(ipcMain);
  startupLog('运行时初始化完成，创建窗口。');
  ipcMain.handle('dialog:select-files', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择要纳入资产库的文件',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '可用素材', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'mov', 'wav', 'mp3', 'txt', 'md'] },
        { name: '全部文件', extensions: ['*'] }
      ]
    });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle('dialog:select-character-pack', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择人物资产包（ZIP）',
      properties: ['openFile'],
      filters: [{ name: '人物资产包', extensions: ['zip'] }]
    });
    return result.canceled ? undefined : result.filePaths[0];
  });
  ipcMain.handle('dialog:select-directory', async () => {
    const result = await dialog.showOpenDialog({ title: '选择项目资产包导出位置', properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? undefined : result.filePaths[0];
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`虚拟资产创作工作台启动失败：${message}`);
  startupLog(`主进程启动失败：${message}`);
  dialog.showErrorBox('虚拟资产创作工作台无法启动', `本地运行环境没有正确加载。\n\n${message}\n\n请重新打包应用；如果问题持续，请保留此提示并联系维护者。`);
  app.exit(1);
});
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => runtime?.close());
