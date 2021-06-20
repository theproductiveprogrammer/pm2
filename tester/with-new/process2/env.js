'use strict'

const val = process.env.ENV_VAL
if(!val) console.log('FAILED FINDING ENVIRONMENT VALUE')
else console.log(`ENV_VAL = ${val}`)

setTimeout(() => 1, 1 << 111)
