import os
import time
import sys

val = os.environ.get('ENV_VAL')
if val == None:
    print('FAILED FINDING ENVIRONMENT VALUE')
else:
    print('ENV_VAL = ' + val)

sys.stdout.flush()
time.sleep(60 * 5000)
