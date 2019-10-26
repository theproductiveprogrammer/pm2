'use strict'
let pm2 = require('.')

pm2.start()
pm2.start({
    name: 'fails',
}, (err) => {
    console.error('process1:',err)
})
pm2.start({
    name: 'fail1',
    cwd: './tester',
})
pm2.start({
    name: 'fail2',
    script: './tester',
})
pm2.start({
    name: 'process1',
    cwd: './tester/with-new/process1'
})
pm2.start({
    name: 'process2',
    script: './tester/with-new/process1/process2/serve.py',
    log: 'process2.log',
})
