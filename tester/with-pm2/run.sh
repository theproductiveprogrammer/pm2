#!/bin/bash
npm run build || exit 1
export PATH=
./dist/mac/pm2-electron-tester.app/Contents/MacOS/pm2-electron-tester
