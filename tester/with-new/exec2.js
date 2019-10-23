'use strict'
const fs = require('fs')
const proc = require('child_process')

/*      understand/
 * `proc.spawn` creates an `EventEmitter` with the following events:
 *      + 'error': Failed to start the given process
 *      + 'exit': Process exited (fires sometimes)
 *      + 'close': Process exited cleanly
 * `exit` and `close` may both be fired or not.
 *
 *      outcome/
 * We spawn the process and set up the even listeners:
 *      - when we get data, we show them line by line
 *        (stdout and stderror streams)
 *      - on error we dump whatever we have and callback
 *        with the error
 *      - on exit/close we dump whatever we have and call
 *        back based on the return code (error or ok)
 *      - we ensure we don't call back more than once
 */
module.exports = function(cmd, args, cwd, log, cb, env, pfx_) {
    let child
    if(env) child = proc.spawn(cmd, args, { cwd: cwd, env: env, windowsHide: true })
    else child = proc.spawn(cmd, args, { cwd: cwd, windowsHide: true })

    let op = ""
    let er = ""
    child.stdout.on('data', (data) => {
        op += data
        op = show_lines_1(op)
    })
    child.stderr.on('data', (data) => {
        er += data
        er = show_lines_1(er)
    })

    child.on('error', (err) => {
        call_back_with(err)
    })
    child.on('exit', on_done_1)
    child.on('close', on_done_1)

    function out(m) {
        fs.appendFile(log, m + '\n', (err) => {
            if(err) {
                console.error(m)
                console.error(err)
            }
        })
    }

    function on_done_1(code, signal) {
        if(code || signal) call_back_with(`Exited with error: ${cmd} ${args}`)
        else call_back_with()
    }

    let cb_done = false
    function call_back_with(err) {
        dump_full_stream_1()

        if(cb_done) return
        cb_done = true

        cb(err)
    }

    function show_lines_1(f) {
        if(!f) return f

        let lines = f.split(/[\n\r]+/)
        for(let i = 0;i < lines.length-1;i++) {
            out(pfx(lines[i]))
        }
        return lines[lines.length-1]
    }

    function dump_full_stream_1() {
        if(op && op.trim()) out(pfx(op.trim()))
        if(er && er.trim()) out(pfx(er.trim()))
        op = ""
        er = ""
    }

    function pfx(v) {
        if(pfx_) return pfx_ + ":" + v
        else return v
    }
}
