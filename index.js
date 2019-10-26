'use strict'
const fs = require('fs')
const path = require('path')
const proc = require('child_process')

module.exports = {
    start : start,
    restart: restartByName,
    stop: stopByName,
    stopall,
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
    if(!cb) cb = (err) => {
        if(err) {
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
        restartAt: pi.restartAt,
        cb: cb,
    }

    get_script_1(pi, (script) => {
        pi._script = script
        if(!pi._script) {
            cb(`No script given to run`)
            return
        }
        let handler = getScriptHandler(script)
        if(handler) {
            REG.push(pi)
            handler(pi)
            cb()
        } else {
            cb(`Don't know how to start ${script}`)
        }
    })

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
    REG.forEach((pi) => {
        if(pi.name === name) stop(pi, cb)
    })
}

function stopall() {
    REG.forEach(stop)
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
 * Restart the requested process by stopping it and then getting the
 * appropriate handler to restart it
 */
function restart(pi) {
    if(pi.child) {
        stop(pi, (err) => {
            if(err) {
                pi.cb && pi.cb(err)
            } else {
                startagain_1(pi)
            }
        })
    } else {
        startagain_1(pi)
    }

    function startagain_1(pi) {
        let handler = getScriptHandler(pi._script)
        if(handler) {
            handler(pi)
            pi.cb && pi.cb()
        } else {
            pi.cb && pi.cb(`Don't know how to restart ${script}`)
        }
    }
}

/*      outcome/
 * Send a message to the child to stop and wait a bit to see if it
 * complies. If it does fine, otherwise try to kill it.
 */
function stop(pi, cb) {
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
        if(pi.log) {
            if(pi.name) line = `${pi.name}: ${line}\n`
            else line = line + '\n'
            fs.appendFile(pi.log, line, (err) => {
                if(err) {
                    console.error(m)
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
 * child process.
 */
function handleExit(pi) {
    let child = pi.child

    child.on('error', (err) => {
        if(child == pi.child) pi.child = null
        pi.flush && pi.flush()
        pi.cb && pi.cb(err)
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
            pi.cb && pi.cb(`Exited with error`)
        } else if(signal) {
            pi.cb && pi.cb(`Killed`)
        } else {
            pi.cb && pi.cb()
        }
    }

}
