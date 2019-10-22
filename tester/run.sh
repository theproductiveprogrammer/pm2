#!/bin/bash

function build() {
    npm run build || exit 1
}

#   outcome/
# Ensure that we are not reaching any user-specific installs (NodeJS
# etc) and then run
function run_cleanly() {
    export PATH=
    ./dist/mac/pm2-electron-tester.app/Contents/MacOS/pm2-electron-tester
}

function showHelp() {
    cat << EOF
Tester for PM2 replacement.

Run this tester with two parameters:
    1. --pm2: With PM2 (will fail)
    2. --new: With our new & improved PM2 (should succeed)

Failing and suceeding can be seen in the output and the log files.
Refer the 'tester.js' files if you're unsure about anything.

WARNING: Because this rebuild the 'dist' version everytime, it will
be slow

EOF
}

if [ "$1" == "--pm2" ]
then
    cd with-pm2 || exit 1
    build       || exit 1
    run_cleanly
elif [ "$1" == "--new" ]
then
    cd with-new || exit 1
    build       || exit 1
    run_cleanly
else
    showHelp
fi

