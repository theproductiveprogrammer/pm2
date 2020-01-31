'use strict'
const fs = require('fs')
const path = require('path')
const proc = require('child_process')
const stripAnsi = require('strip-ansi')

module.exports = {
    start : start,
    restart: restartByName,
    stop: stopByName,
    stopAll,
    onstopping,
}

/*      understand/
 * PROCESS REGISTRY
 */
let REG = []

/*      understand/
 * Shutdown hook to be called before shutdown (should be called only
 * once)
 */
let ONSTOPPING
let ONSTOPPING_CALLED

/*      outcome/
 * We get the values we require from the user, set up some defaults, and
 * start the given process depending on what type it is
 */
function start(pi, cb) {
    if(!cb) cb = (err, pid) => {
        if(err && pid) {
            if(pi && pi.name) console.error(pi.name, err, pid)
            else console.error(err, pid)
        } else if(err) {
            if(pi && pi.name) console.error(pi.name, err)
            else console.error(err)
        }
    }

    if(!pi) return cb(`Cannot start process without any information`)
    if(!pi.script && !pi.cwd) return cb(`Cannot start process without 'script' or 'cwd'`)

    pi = {
        name: pi.name,
        script: pi.script,
        cwd: pi.cwd,
        log: pi.log,
        stripANSI: pi.stripANSI,
        restartAt: pi.restartAt,
        restartOk: pi.restartOk,
        cb: cb,
    }

    if(!pi.restartAt) pi.restartAt = [100,500,1000,30*1000,60*1000,5*60*1000,15*60*1000]
    if(!pi.restartOk) pi.restartOk = 30 * 60 * 1000

    get_script_1(pi, (script) => {
        pi._script = script
        fixAsarIssue(pi)
        if(!pi._script) {
            cb(`No script given to run`)
            return
        }
        let handler = getScriptHandler(script)
        if(handler) {
            REG.push(pi)
            handler(pi)
            cb(null, pi.child.pid)
        } else {
            cb(`Don't know how to start ${script}`)
        }
    })

    /**
     *      outcome/
     *  This will check the given script or CWD is inside asar file or not.
     * If given script or CWD is inside, it will change the script and CWD
     * to as per asar child process support.
     * else this will keep same
     * @param {*} pi
     */
    function fixAsarIssue(pi) {
        if (pi.cwd.includes('/app.asar/') ||
                pi.cwd.includes('\\app.asar\\')) {
            let p = pi.cwd.split('app.asar')
            if (p.length == 2){
                pi._script = path.join('app.asar', p[1], pi._script)
                pi.cwd = p[0]
            }
        } else if (pi._script.includes('/app.asar/') ||
                pi._script.includes('\\app.asar\\')) {
            let p = pi._script.split('app.asar')
            if (p.length == 2){
                pi._script = path.join('app.asar', p[1])
                pi.cwd = p[0]
            }
        }
    }

    /*      understand/
     * A nodejs module contains a 'package.json' file which generally
     * gives the 'main' entry script for the module. So we can use this
     * to find the script to run if we haven't been given it.
     *
     *      outcome/
     * If the script is provided, we use that. Otherwise we check if we
     * are a node module and try and derive the script from the
     * 'package.json'.
     */
    function get_script_1(pi, cb) {
        if(pi.script) return cb(pi.script)
        try {
            let pkg = path.join(pi.cwd, 'package.json')
            fs.readFile(pkg, (err, data) => {
                if(err) cb()
                else {
                    let obj = JSON.parse(data)
                    cb(obj.main)
                }
            })
        } catch(e) {
            cb()
        }
    }
}

function restartByName(name) {
    REG.forEach((pi) => {
        if(pi.name === name) restart(pi)
    })
}

function stopByName(name, cb) {
    let piAvailable = false
    REG.forEach((pi) => {
        if(pi.child && pi.name === name){
            piAvailable = true
            stop(pi, cb)
        }
    })
    if(!piAvailable) cb()
}

function stopAll(cb) {
    REG.forEach((pi) => {
        if(pi.child) stop(pi, cb)
    })
}

/*      outcome/
 * Set the 'onstopping' hook which is called before the process shuts
 * down.
 */
function onstopping(hook) {
    ONSTOPPING = hook
    ONSTOPPING_CALLED = false

    process.on('message', (m) => {
        if(m.stopping) callOnStoppingHook_1()
    })
    process.on('beforeExit', (code) => callOnStoppingHook_1())
    process.on('exit', (code) => callOnStoppingHook_1())

    function callOnStoppingHook_1() {
        if(ONSTOPPING_CALLED) return
        ONSTOPPING_CALLED = true
        ONSTOPPING()
    }
}



/*      outcome/
 * Restart the requested process by stopping it and then starting it
 * again.
 */
function restart(pi) {
    if(pi.child) {
        stop(pi, (err) => {
            if(err) {
                pi.cb && pi.cb(err)
            } else {
                startAgain(pi)
            }
        })
    } else {
        startAgain(pi)
    }
}

/*      outcome/
 * This function finds the appropriate handler for the process and
 * starts the process again marking the time it has been restarted.
 * It assumes that the process has been correctly started/setup before
 * and stopped so it does no error checking
 */
function startAgain(pi) {
    let handler = getScriptHandler(pi._script)
    if(handler) {
        handler(pi)
        pi.stopRequested = false
        pi.lastStart = Date.now()
        pi.cb && pi.cb(null, pi.child ? pi.child.pid : undefined)
    } else {
        pi.cb && pi.cb(`Don't know how to restart ${pi._script}`)
    }
}

/*      outcome/
 * Send a message to the child to stop and wait a bit to see if it
 * complies. If it does fine, otherwise try to kill it.
 */
function stop(pi, cb) {
    pi.stopRequested = true
    if(pi.restartInProgress) clearTimeout(pi.restartInProgress)
    if(!pi.child) {
        cb && cb(`No process to stop`)
        return
    }

    try {
        pi.child.send && pi.child.send({ stopping: true })
        setTimeout(() => {
            if(pi.child) pi.child.kill()
            cb && cb()
        }, 200)
    } catch(e) {
        cb && cb(e)
    }
}

/*      problem/
 * Depending on the type of file we need to run, return a handler that
 * can launch that type.
 *      way/
 * Use the extension of the file to determine it's type and then return
 * a matching handler
 */
function getScriptHandler(script) {
    if(!script) return
    let handlers = {
        ".js" : launchJSProcess,
        ".py" : launchPythonProcess,
    }
    let ext = path.extname(script)
    if(ext) return handlers[ext]
}

/*      outcome/
 * We use the standard `child_process.spawn` function to launch a python
 * process with the given script as the first argument. Then we capture
 * the output and handle process exits.
 */
function launchPythonProcess(pi) {
    let opts = {
        windowsHide: false,
        detached: false,
    }

    if(pi.cwd) opts.cwd = pi.cwd
    if(pi.env) opts.env = pi.env
    if(!pi.args) pi.args = [pi._script]
    else pi.args = [pi._script].concat(pi.args)

    pi.child = proc.spawn('python', pi.args, opts)

    pi.flush = captureOutput(pi)
    handleExit(pi)
}

/*      understand/
 * To launch the requested process as a new NodeJS process, we use a
 * special node js function (`child_process.fork`) that launches other
 * nodejs processes and creates a connection with them so we can
 * communicate via messages. This both (a) allows us to use the electron
 * embedded NodeJS and allows us to send messages requesting the child
 * to shutdown when we are shutting down ourselves.
 *
 *      outcome/
 * Launch the child process using `child_process.fork`, capturing the
 * output and handling what happens when the process exits.
 */
function launchJSProcess(pi) {
    let opts = {
        silent: true,
        detached: false,
    }

    if(pi.cwd) opts.cwd = pi.cwd
    if(pi.env) opts.env = pi.env
    if(!pi.args) pi.args = []

    pi.child = proc.fork(pi._script, pi.args, opts)

    pi.flush = captureOutput(pi)
    handleExit(pi)
}

/*      outcome/
 * As data comes in either the error or output stream we capture it and
 * show individual lines.
 */
function captureOutput(pi) {
    if(!pi.child) return () => "Doing Nothing"

    let op = ""
    let er = ""

    pi.child.stdout.on('data', (data) => {
        op += data
        op = show_lines_1(op)
    })
    pi.child.stderr.on('data', (data) => {
        er += data
        er = show_lines_1(er, true)
    })

    return flush

    function flush() {
        if(op && op.trim()) out(pi, op.trim())
        if(er && er.trim()) out(pi, er.trim(), true)
        op = ""
        er = ""
    }

    function show_lines_1(f, iserr) {
        if(!f) return f

        let lines = f.split(/[\n\r]+/)
        for(let i = 0;i < lines.length-1;i++) {
            out(pi, lines[i], iserr)
        }
        return lines[lines.length-1]
    }

    /*      outcome/
     * Given a log file we output to the log file. If no log file is
     * given we output to stdout/stderr.
     */
    function out(pi, line, iserr) {
        if(pi.stripANSI) line = stripAnsi(line)
        if(pi.log) {
            if(pi.name) line = `${pi.name}: ${line}\n`
            else line = line + '\n'
            fs.appendFile(pi.log, line, (err) => {
                if(err) {
                    console.error(err)
                }
            })
        } else {
            if(pi.name) line = `${pi.name}: ${line}`
            if(iserr) console.error(line)
            else console.log(line)
        }
    }
}

/*      understand/
 * The ChildProcess is an `EventEmitter` with the following events:
 *      + 'error': Failed to start the given process
 *      + 'exit': Process exited (fires sometimes)
 *      + 'close': Process exited cleanly
 * `exit` and `close` may both be fired or not.
 *
 *      outcome/
 * If there is an error, exit, or close, we flush whatever data we have
 * so far and then callback with the error or completion and clear the
 * child process. Allow the process to restart if needed.
 */
function handleExit(pi) {
    if(!pi.child) return

    let child = pi.child

    child.on('error', (err) => {
        if(child == pi.child) pi.child = null
        pi.flush && pi.flush()
        pi.cb && pi.cb(err)
        restartIfNeeded(pi)
    })
    child.on('exit', on_done_1)
    child.on('close', on_done_1)

    let prevcode, prevsignal

    function on_done_1(code, signal) {
        if(child == pi.child) pi.child = null
        pi.flush && pi.flush()
        if(code == prevcode && signal == prevsignal) return
        prevcode = code
        prevsignal = signal
        if(code && code) {
            pi.cb && pi.cb(`Exited with error`, child.pid)
        } else if(signal) {
            pi.cb && pi.cb(`Killed`, child.pid)
        } else {
            pi.cb && pi.cb()
        }
        restartIfNeeded(pi)
    }
}

/*      outcome/
 * If the process is not running, check which restart interval is needed
 * then launch a restart after that time. Note that if the `restartAt`
 * parameter is the special parameters `[]` or `[0]` or if the process
 * is already started somehow we don't start it again.
 */
function restartIfNeeded(pi) {
    if(!pi.restartAt || pi.restartAt.length == 0) return
    if(pi.restartAt.length == 1 && pi.restartAt[0] == 0) return
    if(pi.child) return
    if(pi.stopRequested) return

    if(pi.restartInProgress) return

    let intv = get_restart_interval_1()

    pi.restartInProgress = setTimeout(() => {
        pi.restartInProgress = false
        if(!pi.child && !pi.stopRequested) startAgain(pi)
    }, intv)


    /*      outcome/
     * The restartAt[] parameter gives a list of times (usually
     * increasing) at which to attempt the restart of this process.
     * We keep track of the current index and go all the way to the end.
     * If the process has been running successfully for `restartOk` we go
     * back to the begginning cycle again.
     */
    function get_restart_interval_1() {
        let ndx = pi.restartAtNdx ? pi.restartAtNdx : 0
        if(pi.lastStart && (Date.now() - pi.lastStart > pi.restartOk)) ndx = 0

        if(!ndx) pi.restartAtNdx = 1
        else pi.restartAtNdx += 1
        if(pi.restartAtNdx >= pi.restartAt.length) pi.restartAtNdx = pi.restartAt.length-1

        return pi.restartAt[ndx]
    }
}
