# Eggplant

> A simple chat application.

## For development

### Edit dev env file and start (run on dev machine)

```bash
cp .env.dev.example .env
nano .env
docker compose --file compose.dev.yml up --detach
```

Migrations run automatically on backend start. To generate one, run:

```bash
docker compose --file compose.dev.yml exec backend sh
npm run db:generate
```

### Admin panel

The admin panel runs inside the `backend` container on port `8001`.
To create an admin user, run:

```bash
docker compose --file compose.dev.yml exec backend sh
npm run db:create-admin -- your-username your-password
```

Then navigate to <http://127.0.0.1:8001/admin>.

## For production

### Setup production `.env` file (run on dev machine)

Copy the template and fill in real values:

```bash
ssh user@server "mkdir -p ~/apps/eggplant"
scp .env.prod.example user@server:~/apps/eggplant/.env
ssh user@server "nano ~/apps/eggplant/.env"
```

### Set the domain (run on dev machine)

Set `PROD_DOMAIN` in `.env`:

Run if you haven't yet:

```bash
cp .env.dev.example .env
nano .env
docker compose --file compose.dev.yml up --detach
```

`PROD_DOMAIN` must match the server's `.env`.

### Build (run on dev machine)

```bash
./build.sh                     # web only
./build.sh --android           # web + android
./build.sh --desktop           # web + desktop
./build.sh --android --desktop # web + android + desktop
```

### Deploy (run on dev machine)

```bash
./deploy.sh
```

All settings can be passed as arguments to skip the prompts:

```bash
./deploy.sh [HOST] [PORT] [USER] [PASSWORD] [REMOTE_DIR]
```

Optional: to avoid re-entering your password on every ssh/rsync call, if it's
not passed as argument to the script, set up SSH connection multiplexing:

```bash
tee ~/.ssh/config > /dev/null <<ENDSEQ
Host your-server-address
    HostName your-server-address
    Port 22
    User your-user
    ControlMaster auto
    ControlPath ~/.ssh/cm-%r@%h:%p
    ControlPersist 10m
ENDSEQ
```

## Registration rules

Restrict registration via the admin panel ("Registration rules" table).
An empty table means anyone can register.

## VPN / TUN mode fix

If the production site is unreachable while a VPN with TUN mode is active:

```bash
./setup-docker-bypass-tun.sh
```
