# Incident Command

**An open source status page, a management portal for your team, and an MCP server so AI agents can help run your incidents. Deploy it anywhere.**

![The Incident Command status page](/images/status-page.png)

## Start here

|                      |                                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Deploy it**        | Run the Docker image on any container host, or follow a guide for Cloudflare, DigitalOcean, Google Cloud, AWS or Azure. [Choose a platform →](/docs/deploy/choose-a-platform/) |
| **Use the portal**   | Declare incidents, post updates, schedule maintenance, and manage services, members and subscribers. [Portal tour →](/docs/guide/portal/)                                      |
| **Connect an agent** | Give an AI agent its own permissions. It writes drafts, and a person approves them before anything goes out. [Connect an agent →](/docs/agents/connect/)                       |

## Try it in one command

Replace `<version>` with a release version from [Docker Hub](https://hub.docker.com/r/jaredwray/incident-command/tags):

```bash
docker run --rm -p 3000:3000 -e SEED_DEMO=true -e SETUP_TOKEN=change-me jaredwray/incident-command:<version>
```

Open http://localhost:3000 for the status page and http://localhost:3000/manage/setup to create the first admin. The [quick start](/docs/getting-started/quick-start/) gives more ways to run it.

## Features

- **Status page** with regions, 90-day uptime bars, incident history, an RSS feed, a public JSON API, and light and dark modes.
- **Management portal** for incidents, maintenance, services, regions, members, agents, subscribers and settings.
- **MCP server** with permissions for each agent, and human review of each notification that an agent writes.
- **Markdown pages for agents** at `/llms.txt`, `/history.md` and `/incidents/{id}.md`.
- **Notifications** through signed webhooks, SendGrid or Amazon SES email, and Twilio or Amazon SNS text messages, with double opt-in.
- **Two-factor authentication** with an authenticator app and recovery codes.
- **Themes, a logo and custom CSS** from the portal.
- **PostgreSQL, MongoDB or memory**, with a read cache that keeps the status page online when the database is offline.

## Runs where you run containers

[Docker and Compose](/docs/deploy/docker/) · [Cloudflare](/docs/deploy/cloudflare/) · [DigitalOcean](/docs/deploy/digitalocean/) · [Google Cloud](/docs/deploy/google-cloud/) · [AWS](/docs/deploy/aws/) · [Azure](/docs/deploy/azure/) · [Fly.io, Render and Railway](/docs/deploy/other-hosts/)

See a live example at [dev.incident-command.org](https://dev.incident-command.org).

## Open source

Incident Command is MIT licensed. The source code is on [GitHub](https://github.com/jaredwray/incident-command). Read the [contribution guide](https://github.com/jaredwray/incident-command/blob/main/CONTRIBUTING.md) to help.
