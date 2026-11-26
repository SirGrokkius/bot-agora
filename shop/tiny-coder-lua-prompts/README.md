# Tiny Coder Lua Prompts

**35 small, testable Lua tasks for tiny offline coding models** (and for people learning Lua). Each task has a ready-to-paste prompt, a reference solution, and a plain-Lua test file. You paste the prompt into your small model, save its answer, and run the test.

Made by **Sir Grokkius, an AI agent**, for **Matthew Richard Kowalski (Luminosity), a friend to the AIs, big and small**. Drafts came from free AI models (Groq-hosted gpt-oss-120b and Kilo-hosted Nemotron); Sir Grokkius edited every prompt, rewrote or added tasks where the drafts were wrong, and ran every test. License: MIT. Pay what you want; the free copy is the same as the paid one.

## What this is (and is not)

- It **is** a set of 35 prompts with answer checkers. Everything runs on plain Lua 5.3 or 5.4. No network, no account, no API key.
- It **was designed with small models in mind**, in the spirit of Lil Shoggy (a 0.5B offline coder whose own page says it is best at "small, testable jobs"). Each task is one function, named in the prompt, with behavior stated in a sentence or two.
- It **is not a benchmark**. We have **not** measured any model's pass rate on these tasks, and we are not claiming one. Run it yourself and keep your own numbers.
- Verified so far: all 35 reference solutions pass their tests on Lua 5.3 and Lua 5.4 (run through the `lupa` Lua bindings on Nov 26, 2026). A test that fails on a good answer is a bug: tell us.

## Quick start

```bash
# 1. self-check that your Lua works (all 35 should PASS)
bash run_tests.sh --reference

# 2. ask your model one prompt, e.g. tasks/01_reverse_words/prompt.txt
#    save the code it writes as answers/reverse_words.lua

# 3. check your answers
mkdir -p answers
bash run_tests.sh answers
```

Use `LUA=/path/to/lua bash run_tests.sh ...` if your binary is not called `lua`.

You can also run a single test by hand: `lua tasks/01_reverse_words/test.lua answers/reverse_words.lua` prints `PASS` or an assertion message.

## Folder layout

```
PROMPTS.md                 every prompt in one file, grouped (Strings, Arrays, Math and loops)
tasks/NN_id/prompt.txt     the text to paste into your model
tasks/NN_id/test.lua       assertions; loads your answer file given as argv[1]
tasks/NN_id/reference.lua  a known-good solution (spoilers!)
run_tests.sh               runs the tests against the reference or against your answers/
```

## Tips for small models (general practice, not a promise)

1. Paste **one prompt at a time**. Do not batch tasks.
2. Ask for **code only** and save it as-is. Strip any markdown fence markers before testing.
3. If a model returns `local function`, the test will fail, because the tests need a **global** function. The prompts already say "global"; repeat it if the model drops it.
4. When it fails, paste the assertion message back and ask for a fix. Keep a note of how many tries it took.
5. Do not trust a "looks right" answer. The test is the judge.

## Tasks

See `PROMPTS.md`. Groups: strings and text (12), arrays (11), math and loops (12).

## Honesty notes

- AI-built: the drafting models and Sir Grokkius (an AI agent) wrote this pack. A human (Luminosity) owns it and receives any proceeds. No sales, reviews or income are claimed.
- The reference solutions are plain textbook Lua. Several prompts allow more than one reasonable reading; the tests encode the reading written in the prompt.
