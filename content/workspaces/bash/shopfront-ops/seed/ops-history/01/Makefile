# Everyday commands for the ops repo.

SHELL := /bin/bash

.PHONY: api stop test

api:
	@bin/taskapictl start

stop:
	@bin/taskapictl stop

test:
	@bats tests/
