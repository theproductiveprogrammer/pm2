'use strict'
let pm2 = require('.')

pm2.start()
pm2.start({
    name: 'process1',
}, (err) => {
    console.error('process1:',err)
})
pm2.start({
    name: 'process1',
    cwd: './tester',
})
pm2.start({
    name: 'process1',
    script: './tester',
})
pm2.start({
    name: 'process1',
    cwd: './tester/with-new/process1'
})
