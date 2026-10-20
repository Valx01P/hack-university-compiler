# Everyday commands for the ops repo. `make` alone lists them.

SHELL := /bin/bash
.DEFAULT_GOAL := help

SCRIPTS := bin/taskapictl $(wildcard bin/*.sh) $(wildcard bin/lib/*.sh) $(wildcard bin/sim/*) \
	$(wildcard stubs/*) tests/helpers/stub.bash $(wildcard tests/*.bats)

.PHONY: help api stop test lint report

help: ## List the targets
	@grep -E '^[a-z]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{ printf "  make %-7s %s\n", $$1, $$2 }'

api: ## Start taskapi in the background on API_PORT (8080)
	@bin/taskapictl start

stop: ## Stop taskapi
	@bin/taskapictl stop

test: ## Run every bats test in tests/
	@bats tests/

lint: ## Check every script with ShellCheck
	@shellcheck $(SCRIPTS)

report: ## Print the sales report by day, then by product
	@bin/report-sales.sh -d
	@echo
	@bin/report-sales.sh -p
