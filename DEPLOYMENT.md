# hui-v40 deployment

`android-frontend` is the only source of truth for the hui-v40 shell. The
co-reading sub-application is a separately built artifact from
`/home/ubuntu/hui-coread/public`; the deploy script assembles both trees.

Do not edit `/usr/share/caddy/hui-v40` directly and do not copy files into it
manually. `/home/ubuntu/hui-v40-memory-stage` is retired and is not a deploy
source.

## Validate

```bash
npm run check
npm run deploy:check
```

`deploy:check` builds the exact release tree in a temporary directory and
prints the rsync plan without changing the live site.

## Deploy

```bash
npm run deploy
```

Every deployment first archives the complete live tree under
`/home/ubuntu/hui-v40-backups/deployments`, then synchronizes with `--delete`
so the web root cannot accumulate stale bundles or editor backups. It finishes
by checking for drift and requesting the essential public pages.

## Roll back

Choose a deployment archive, extract it to a temporary directory, inspect it,
then rsync its `hui-v40/` directory back to `/usr/share/caddy/hui-v40/`. Keep
rollback as an explicit operator action; the deploy script never overwrites a
backup.
