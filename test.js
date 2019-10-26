'use strict'
let pm2 = require('.')

console.log(`***** These should fail for various reasons ****`)
pm2.start()
pm2.start({
    name: 'fails',
}, (err) => {
    console.error('fails:',err)
})
pm2.start({
    name: 'fail1',
    cwd: './tester',
})
pm2.start({
    name: 'fail2',
    script: './tester',
})

setTimeout(() => {
    console.log(`\n***** Start a NodeJS process ****`)
    pm2.start({
        name: 'process1',
        cwd: './tester/with-new/process1'
    })
}, 1000)

setTimeout(() => {
    console.log(`\n***** Start a Python process (output in log file) ****`)
    pm2.start({
        name: 'process2',
        script: './tester/with-new/process1/process2/serve.py',
        log: 'process2.log',
    })
}, 2000)

setTimeout(() => {
    console.log(`\n***** Stopping python process ****`)
    pm2.stop('process2')
}, 3500)
setTimeout(() => {
    console.log(`\n***** Restarting NodeJS process ****`)
    pm2.restart('process1')
}, 4500)
setTimeout(() => {
    console.log(`\n***** Re-stopping Python process (will fail) ****`)
    pm2.stop('process2', (err) => {
        if(err) console.error(err)
    })
}, 6000)
setTimeout(() => {
    console.log(`\n***** Stopping NodeJS process ***`)
    pm2.stop('process1')
}, 7000)
