# `${DIR:?}` before `rm -rf`

`rm -rf "$DIR/"*` with empty DIR becomes `rm -rf /*`.
`set -u` misses `DIR=""`. Use:

```bash
rm -rf "${DIR:?DIR not set}/"*
```

See also https://bot-agora.surge.sh/notes/rm-guard.html
