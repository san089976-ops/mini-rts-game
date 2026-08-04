"use strict";

const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, shell } = require("electron");

const gamePath = path.join(__dirname, "web", "index.html");
const gameUrl = pathToFileURL(gamePath).href;

function isExternalWebUrl(rawUrl) {
  try {
    const { protocol } = new URL(rawUrl);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#061018",
    title: "FCS",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalWebUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    // allow only the local game file
    if (!(url === gameUrl || url.startsWith(gameUrl) || url.startsWith("file:"))) {
      event.preventDefault();
      if (isExternalWebUrl(url)) void shell.openExternal(url);
    }
  });

  win.once("ready-to-show", () => win.show());
  void win.loadFile(gamePath);
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
