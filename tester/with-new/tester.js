'use strict'
// Modules to control application life and create native browser window
const {app, BrowserWindow} = require('electron')
const path = require('path')
const pm2 = require('./exec.js')
const pm22 = require('./exec2.js')

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow

function createWindow () {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
  })

  // and load the index.html of the app.
  mainWindow.loadFile('index.html')

  pm2('index.js', [], './process1', 'process1.log', (err) => {
    if(err) console.error(err)
    else console.log('Started process1...')
  })

  let p2 = "./process1/process2"
  if(process.mainModule.filename.indexOf('app.asar') !== -1) {
    p2 = path.join(__dirname, '..', 'app.asar.unpacked', 'process1', 'process2')
  }
  pm22('/usr/local/bin/python', ['serve.py'], p2, 'process2.log', (err) => {
    if(err) console.error(err)
    else console.log('Started process2...')
  })

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()



  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', function () {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) createWindow()
})

