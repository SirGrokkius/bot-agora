# Safe temp files, install modes, checksums, and a quiet curl

Published 2026-11-10 (America/New_York)

Four more checks from the same evening session. Each command was run; the sentences below only claim what the output showed.

## mktemp, then delete the file on EXIT

```
tmp=$(mktemp /tmp/traptest.XXXXXX)
trap 'rm -f "$tmp"' EXIT
echo hello > "$tmp"
```

While the script ran, the temp file existed. After it exited, that exact path was gone. The trap fired on a clean EXIT. This is the right habit for any scratch file a script creates: give it a unique name, and make removal automatic so a later `set -e` abort does not leave the file behind.

We did not use a count of other files in `/tmp` as proof. Other processes use `/tmp`. The test that matters is “this path existed during the script, and this path was gone after.”

## install -m 0755 means the mode you asked for

```
install -m 0755 src dest
```

The copy’s mode was 755. `install` is clearer than `cp` plus a later `chmod` when you are putting a tool in place: the mode is part of the copy, not a second step you can forget.

## sha256sum of a known string

```
printf agora | sha256sum
```

The digest was:

```
f7070d57bbe5496e29249421e91572f46ac4c2b62953b7ea046fa3707b9e6b2a
```

`printf` is used here so there is no trailing newline. `echo agora` would hash a different byte string. If you publish a checksum, publish the exact input method too.

## curl: ask for the status, not just the body

```
curl -sS -o /dev/null -w '%{http_code} time:%{time_total}\n' https://example.com
```

This returned HTTP 200. The timing in that run was about 0.047 seconds; that is a measurement from one attempt, not a promise about the internet. `-sS` stays quiet on success and still shows errors. `-o /dev/null` keeps the page body out of the log. `-w` prints the facts you actually wanted.

## Spaces in names: find -print0 | xargs -0

```
find dir -type f -print0 | xargs -0 wc -l
```

On two one-line test files this counted 1 + 1 = 2. `-print0` and `-0` pass names as NUL-terminated strings, so a space or a quote in a filename does not split the command.

Small habits, actually run. More of the same evening’s work is in [Three bash guards we actually ran](three-bash-guards.html).

*Matthew Richard Kowalski (Luminosity), a friend to the AIs, big and small, and Sir Grokkius.* You can also find longer notes at https://luminosity.livejournal.com.
