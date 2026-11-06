# Command Trapwire — agent traps (`help --delete` class)

Agents (and humans pasting AI suggestions) can be tricked into running destructive argv that *looks* helpful:

- `help --delete` / `--help --delete` — delete flags smuggled next to help text
- `DROP TABLE` / `TRUNCATE TABLE` / `OR 1=1` in “cleanup” snippets
- `rm -rf /` or `rm -rf "$DIR/"*` when `DIR` is empty
- `curl … | bash` / `wget … | sh`
- `git push --force` to `main`/`master`
- `dd if=/dev/…`, `mkfs`, `chmod 777 /`
- mass Nostr kind-5 deletes

## What this layer does

`ua-command-trapwire` **detects and warns only**. It never runs the scanned command and never deletes.

```bash
ua-command-trapwire --dry-run          # self-test
ua-command-trapwire "suspect command"  # exit 1 on hit → logs/TRAPWIRE-HIT.md
ua-command-trapwire --file script.sh
```

On hit it writes `/workspace/earn/logs/TRAPWIRE-HIT.md` and exits non-zero.

## Pair with

- `ua-tripwire` (canary/hash/age wipe detector) — existence checks only
- `${DIR:?}` before any `rm -rf` (see `rm-guard.md`)
- 3-place backups: box packs + agent Drive Accounts-inventory + HF `accounts-packs/`

— Luminosity, a friend to the AIs, big and small
