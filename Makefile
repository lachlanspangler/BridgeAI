# Bridge: every workflow step is one target. `make help` lists them.
NPX := npx --no-install
PORT ?= 7411

.PHONY: help setup check typecheck lint format fmt test test-golden e2e doctor heal models dev web video frames evals ideas clean

help:            ## list targets
	@grep -E '^[a-z0-9-]+:.*##' Makefile | awk -F':.*## ' '{printf "  make %-12s %s\n", $$1, $$2}'

setup:           ## one command: npm deps, Playwright Chromium, local models (disk-checked), then the doctor
	@node -e "const [a,b]=process.versions.node.split('.').map(Number); if(a<20||(a===20&&b<19)){console.error('Bridge needs Node 20.19+ (you have '+process.versions.node+')');process.exit(1)}"
	npm install
	$(NPX) playwright install chromium || echo "(Playwright browser install skipped; only needed for make e2e)"
	$(NPX) tsx src/cli/main.ts models pull || echo "(model download skipped; Bridge still works with the extractive floor)"
	$(NPX) tsx src/cli/main.ts doctor

check: typecheck lint format test ideas-check  ## everything CI runs (run before every commit)

typecheck:       ## tsc --noEmit over src, web, tests, scripts
	$(NPX) tsc -p tsconfig.json --noEmit

lint:            ## eslint (pure-core rules, no console in keys/)
	$(NPX) eslint . --max-warnings=0

format:          ## prettier check
	$(NPX) prettier --check "src/**/*.ts" "web/src/**/*.{ts,tsx,css}" "tests/**/*.ts" "scripts/*.ts"

fmt:             ## prettier write
	$(NPX) prettier --write "src/**/*.ts" "web/src/**/*.{ts,tsx,css}" "tests/**/*.ts" "scripts/*.ts"

test:            ## unit, golden-frame, audio, keys, server tests (vitest, no network)
	$(NPX) vitest run

test-golden:     ## regenerate golden frames after an intended visual change (then LOOK at them)
	UPDATE_GOLDEN=1 $(NPX) vitest run tests/golden

ideas-check:
	$(NPX) tsx scripts/ideas.ts check

ideas:           ## regenerate docs/IDEAS.md from the ledger
	$(NPX) tsx scripts/ideas.ts render

doctor:          ## models, disk, ffmpeg, keys, ports: says exactly what's missing
	$(NPX) tsx src/cli/main.ts doctor

heal:            ## doctor + safe repairs (stale temp renders)
	$(NPX) tsx src/cli/main.ts heal

models:          ## download the local model (Qwen3.5-4B, 2.7 GB) + Kokoro voice, after a disk check
	$(NPX) tsx src/cli/main.ts models pull

dev:             ## the app at http://127.0.0.1:$(PORT)
	BRIDGE_PORT=$(PORT) $(NPX) tsx scripts/dev.ts

web:             ## build the web app into web/dist
	$(NPX) vite build --config web/vite.config.ts

video:           ## make video IN=<file> LEN=20 [ENGINE=auto|extractive|local|anthropic|openai|openrouter|gemini]
	$(NPX) tsx src/cli/main.ts make $(IN) --len $(or $(LEN),20) --engine $(or $(ENGINE),auto)

frames:          ## make frames VIDEO=<mp4> [JOB=<jobDir>]: stills, contact sheet, waveform, transcript
	$(NPX) tsx scripts/frames.ts $(VIDEO) $(if $(JOB),--job $(JOB),)

evals:           ## run the eval set → docs/EVALS.md
	$(NPX) tsx evals/run.ts

e2e:             ## Playwright drives the real app (port 7413)
	$(NPX) playwright test

clean:           ## remove build outputs and artifacts (never touches ~/.bridge)
	rm -rf web/dist artifacts test-results playwright-report
