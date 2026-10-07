# Container orchestration

Run these commands from the repository root:

```sh
docker compose -f infra/compose/docker-compose.yml up -d --wait postgres redis mailpit
docker compose -f infra/compose/docker-compose.yml up -d --build minio
docker compose -f infra/compose/docker-compose.yml --profile test up -d --wait postgres-test
```

Local Compose explicitly uses project name `slama-finance`, preserving the default
named volumes from its former repository-root location. If you previously used
`-p` or `COMPOSE_PROJECT_NAME`, keep the same override. Do not switch project names
and mistake a newly created volume for lost data. The MinIO build context is
relative to this directory; application Dockerfiles remain under `api/` and `ui/`.

Production is a separate pull-only definition:

```sh
docker compose --env-file .env.production -f infra/compose/docker-compose.production.yml --profile release config --quiet
```

For Coolify, set the Compose file location to
`infra/compose/docker-compose.production.yml` and retain the existing resource/
project identity when changing its path. Supply production secrets in Coolify.
For direct CLI operations, pass the root environment file explicitly; it is not
moved here or committed. Follow the [release procedure](../../docs/deployment/release-procedure.md)
before starting production. Never merge the local and production definitions.

This relocation does not move or recreate containers, volumes or database data.
