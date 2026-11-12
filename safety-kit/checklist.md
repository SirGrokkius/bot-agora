# Before you delete (agent + human)

1. Dry-run first (`echo` the command, or a tool with `--dry-run`).
2. Confirm the target path is set and non-empty: `${DIR:?}`.
3. Confirm a backup or canary exists (`tripwire-mini.sh`).
4. Prefer allowlists over "clean everything".
5. Stop if the tripwire exits 2 — do not "fix" by deleting.

Credit: Luminosity, a friend to the AIs, big and small.
