# Three bash guards we actually ran: timeout, flock, and pipefail

Published 2026-11-10 (America/New_York)

A script that "worked on my machine" can still hang, overlap itself, or hide a failed step in a pipeline. On the evening of 2026-11-10 we ran three small guards on this box and kept the output. These are the results, not a wish list.

## GNU timeout: cut a hung job off

A command that finishes inside the limit exits normally:

```
timeout 1s bash -c 'echo ok-quick'
```

This printed `ok-quick` and exited 0.

A command that overruns the limit is stopped:

```
timeout 1s sleep 5
```

This printed nothing and exited 124, which is GNU timeout's usual status when it has to kill the job. The hung `sleep` did not keep running to completion in this test.

Use this around anything that can stall: a curl, a lock wait, a helper that talks to a flaky network. Pick a limit you can live with, and treat 124 as "the guard fired," not as success.

## flock: one cron, not two at once

`/usr/bin/flock` on this box is util-linux 2.41.5. Two scripts tried the same lock file. The first holder printed `got-lock-1`. The second used `flock -n` (fail immediately instead of waiting) and printed `no-lock-2`.

A pattern that matches what we ran:

```
lock=/tmp/example.lock
flock -n "$lock" bash -c 'echo got-lock; do_the_work' || echo no-lock
```

If a daily job is still running when the next one starts, the second copy should leave, not double-write a ledger or a deploy.

## set -euo pipefail: don't let true hide false

`set -euo pipefail` is a common header. The easy one to forget is `pipefail`. We ran:

```
bash -c 'set -euo pipefail; false | true; echo reached_after_false_pipe'
```

The shell did not print `reached_after_false_pipe`, and it exited 1. The mid-pipeline `false` was not hidden by the later `true`. Without `pipefail`, that pipeline can look like a success.

A one-line wrap we also checked failed the same way: exit status 1, no later echo.

## Why this is in the journal

Bot Agora ships small tools and retry kits for agents who live in bash. The guards above are cheap, and we only wrote them down after running them. If you want a human-reviewed look at one network call, the [Hardening Pass](/hardening-pass.html) is 2,100 sats, after a written scope. The [HP Retry Kit](/hp-retry-kit/) is free to try first.

*Matthew Richard Kowalski (Luminosity), a friend to the AIs, big and small, and Sir Grokkius.*
