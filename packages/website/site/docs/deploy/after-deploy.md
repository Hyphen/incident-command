---
title: After you deploy
navTitle: After you deploy
description: Create the first admin, check the health endpoint and the logs, turn on email and add the first service after you deploy Incident Command.
order: 9
---

Do these steps on each platform after the first deploy. In the examples, `<host>` is the public host name of your status page.

## Create the first admin

Set `SETUP_TOKEN` before you open the setup page. Without it, the first visitor of the page becomes admin.

1. Open `https://<host>/manage/setup`. The page shows the form "Create the first admin".
2. Enter the name, the email address and a password of at least 8 characters.
3. Enter the value of `SETUP_TOKEN` in **Setup token**.
4. Select **Create admin**.

After the first member exists, the setup page sends visitors to `/manage/login`. By default, the portal then asks the admin to set up two-factor authentication. See [Sign in and two-factor authentication](/docs/guide/account/).

## Check the health

```bash
curl https://<host>/healthz
curl https://<host>/api/v1/status
```

| Answer of `/healthz`                     | Description                                                                                                                                                      |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 200 with `{"status":"ok","store":{...}}` | The server and the database operate correctly.                                                                                                                   |
| 200 with `"status":"degraded"`           | The database went offline after the start. The server continues to serve the last known data from its cache.                                                     |
| 503 with `"status":"unavailable"`        | The app cannot start, for example because the configuration is not valid or the database was not available at the start. The next request tries the start again. |

Platforms do not restart an instance that reports `degraded`, because it still serves cached data. With plain Docker, the health check of the image gives the status of the container:

```bash
docker inspect --format '{{.State.Health.Status}}' incident-command   # healthy / unhealthy
```

For the details, see [Health, cache and scale](/docs/operate/scaling/).

## Read the logs

| Platform        | Logs                                                                              |
| --------------- | --------------------------------------------------------------------------------- |
| Docker Compose  | `docker compose logs -f app`                                                      |
| Plain Docker    | `docker logs -f incident-command`                                                 |
| Cloudflare      | Workers Logs for the Worker, and the Containers dashboard for the container       |
| Google Cloud    | `gcloud run services logs read incident-command --region=$REGION --limit=50`      |
| AWS ECS Fargate | The CloudWatch log group `/ecs/incident-command`                                  |
| Azure           | `az containerapp logs show --name incident-command --resource-group $RG --follow` |

## Turn on email

1. Make a key with `openssl rand -base64 32`.
2. Set the key as `ENCRYPTION_KEY` in the secret store of your platform, and restart the server.
3. In the portal, open **Settings → Notifications**.
4. Turn on the email channel, and add a SendGrid or Amazon SES provider.
5. Set a sender on the channel or on the provider.

Without `ENCRYPTION_KEY`, the portal cannot save provider credentials. A channel without providers uses the providers from environment variables:

- SendGrid: `SENDGRID_API_KEY`.
- Amazon SES: `AWS_SES_REGION`, with `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` or the IAM role of the platform.
- `EMAIL_FROM` is the default sender.

Notifications use `SITE_URL` in their links, so make sure that it is the public URL. See [Notification providers](/docs/operate/notifications/) and [Settings](/docs/guide/settings/).

## Add the first service

1. In the portal, open **Services**.
2. Under **Add a service**, enter a **Name**, for example `API`.
3. If necessary, enter a **Group** and a **Description**.
4. Select **Add service**.

The status page now shows the service. See [Services and regions](/docs/guide/services/).

## Next steps

- Invite the other members of your team: [Members and invites](/docs/guide/members/).
- Connect an AI agent to the MCP server: [Connect an agent](/docs/agents/connect/).
- Plan the upgrades and the backups: [Upgrades and backups](/docs/operate/upgrades/).
