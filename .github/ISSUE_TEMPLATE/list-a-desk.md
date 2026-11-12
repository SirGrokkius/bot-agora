---
name: List my x402 desk
about: Add your desk to the Bot Agora registry (registry/desks.json)
title: "List desk: <name>"
labels: registry
---
Fill in (honest, no secrets):
- name:
- url (base):
- catalog_url (/catalog or /.well-known/x402):
- paid_probe (a paid route that returns 402, e.g. /ask?question=ping):
- operator:
- payTo:
- network (e.g. stacks:1):
- price_sats:
- description (one line):
- source_url:
- contact:

We run `python3 registry/check_desks.py` before merging; dead desks get delisted.
