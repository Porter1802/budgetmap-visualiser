# QLD Capital Investment Atlas — developer entrypoints.
# Reads .env if present so local (apt-installed Postgres) and homelab (compose)
# both work. On the homelab `make up` runs the full stack; locally you point at
# an existing Postgres via .env.

SHELL := /bin/bash
ifneq (,$(wildcard .env))
include .env
export
endif

SQITCH_TARGET ?= db:pg://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@$(POSTGRES_HOST):$(POSTGRES_PORT)/$(POSTGRES_DB)

.PHONY: help up down migrate verify revert ingest dbt soda smoke web-build web-dev api-dev

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

up: ## Bring up the full platform (homelab; Docker)
	docker compose up -d --build

down: ## Stop the platform
	docker compose down

migrate: ## Apply DB migrations (sqitch deploy)
	cd db && sqitch deploy "$(SQITCH_TARGET)"

verify: ## Verify deployed migrations
	cd db && sqitch verify "$(SQITCH_TARGET)"

revert: ## Revert all migrations (DESTRUCTIVE)
	cd db && sqitch revert -y "$(SQITCH_TARGET)"

ingest: ## Run the Dagster ingest assets against the DB
	cd ingest && python -m atlas_ingest.cli

dbt: ## Build dbt models
	cd transform && dbt build

soda: ## Run Soda Core data-quality checks
	cd quality && soda scan -d atlas -c configuration.yml checks/

smoke: ## Quick sanity query against the DB
	@psql "$(DATABASE_URL)" -tAc "select 'projects='||count(*) from projects" 2>/dev/null || echo "DB not reachable"

web-build: ## Build the Next.js frontend
	cd apps/web && npm install && npm run build

web-dev: ## Run the Next.js dev server
	cd apps/web && npm run dev

api-dev: ## Run the FastAPI dev server
	cd apps/api && uvicorn atlas_api.main:app --reload
