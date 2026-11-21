---
title: Choose a platform
navTitle: Choose a platform
description: Compare the platforms that run Incident Command, and decide between the prebuilt Docker Hub image and an image that you build from source.
order: 1
---

Incident Command is one Next.js server in one container image. Each host that runs a Linux container can run it. Each guide in this section gives the full steps for one platform.

## What each deploy needs

- A container image. Use the prebuilt image from Docker Hub, or build an image from source. See [Select the image](#select-the-image).
- A Postgres or MongoDB database. Without a database, the app uses a memory store, and the data goes away when the server stops.
- The public URL of the status page in `SITE_URL`. Notifications use it in their links.
- A long random `SETUP_TOKEN`. It protects the page that creates the first admin.

For all settings, see [Environment variables](/docs/reference/environment-variables/).

## Compare the platforms

| Platform                                     | Image source                                      | Recommended database                                                    | Scale to zero       | Notes                                                                                              |
| -------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------- |
| [Docker and Compose](/docs/deploy/docker/)   | Docker Hub image, or build from source            | Postgres in the Compose stack                                           | No                  | The simplest setup. Use it on a VPS or on a different container host.                              |
| [Cloudflare](/docs/deploy/cloudflare/)       | Build from source (`pnpm cf:deploy`)              | Postgres or MongoDB that accepts connections from the internet          | Yes                 | A Worker sends each request to a container. An idle container stops after `CONTAINER_SLEEP_AFTER`. |
| [DigitalOcean](/docs/deploy/digitalocean/)   | Docker Hub image, or build from source            | DigitalOcean managed Postgres (in `app.yaml`)                           | Optional            | One spec file: `doctl apps create --spec deploy/digitalocean/app.yaml`.                            |
| [Google Cloud](/docs/deploy/google-cloud/)   | Docker Hub image, or build from source            | Cloud SQL for PostgreSQL, or MongoDB Atlas                              | Yes                 | Cloud Run with Secret Manager. Use `--min-instances=1`.                                            |
| [AWS](/docs/deploy/aws/)                     | Docker Hub image (ECS), or an image in Amazon ECR | RDS for PostgreSQL (DocumentDB: test it first)                          | No                  | ECS Fargate, or App Runner for current App Runner customers. SES email through the IAM role.       |
| [Azure](/docs/deploy/azure/)                 | Docker Hub image, or build from source            | Azure Database for PostgreSQL Flexible Server, or Cosmos DB for MongoDB | Yes                 | Container Apps. Use `--min-replicas 1`.                                                            |
| [Fly.io](/docs/deploy/other-hosts/#flyio)    | Docker Hub image, or build from source            | Postgres                                                                | Yes                 | Machines can stop when the app is idle.                                                            |
| [Render](/docs/deploy/other-hosts/#render)   | Docker Hub image, or build from source            | Render Postgres                                                         | Free instances only | Paid instances run all the time.                                                                   |
| [Railway](/docs/deploy/other-hosts/#railway) | Docker Hub image, or build from source            | Railway PostgreSQL                                                      | Optional            | The Serverless option stops an idle service.                                                       |

Scale to zero costs less, but the first request after an idle period waits while the server starts. The new instance also starts with an empty cache. For a status page, keep at least one instance on. See [Health, cache and scale](/docs/operate/scaling/).

## Select the image

The project publishes the image [`jaredwray/incident-command`](https://hub.docker.com/r/jaredwray/incident-command) on Docker Hub for each GitHub release.

| Tag           | Image                                                                 |
| ------------- | --------------------------------------------------------------------- |
| `1.2.3`       | The release 1.2.3. This tag does not change.                          |
| `1.2` and `1` | The newest release of that line. These tags move to each new release. |
| `latest`      | The latest release.                                                   |
| `1.3.0-rc.1`  | A prerelease. A prerelease gets only its version tag.                 |

The guides write the image as `jaredwray/incident-command:<version>`. Replace `<version>` with a release version, for example `1.2.3`. Use an exact version, and do not use `latest`. Then each upgrade is a decision that you make.

### CPU architecture

The image is for `linux/amd64` only. qrbit, the library that draws the QR code for two-factor setup, has no linux-arm64 binary. On an arm64 host, run the image with amd64 emulation, or use an amd64 instance type.

A build from source does not give a correct arm64 image. The image builds, but the two-factor pages fail. By default, the portal requires two-factor authentication, so new members cannot finish their setup.

### Build from source

Build your own image from the `Dockerfile` at the repository root in these conditions:

- You want a private server action key. `next build` writes the key into the image files, so the key of the public image is public. See [Secrets and key rotation](/docs/operate/secrets/).
- You change the code.
- Your platform cannot pull from Docker Hub. Cloudflare and AWS App Runner are examples.

Build from the repository root, because the image needs the workspace lockfile:

```bash
docker build -t incident-command:<version> .
```

To set a private key, put `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` in the environment, and add the build argument:

```bash
docker build --build-arg NEXT_SERVER_ACTIONS_ENCRYPTION_KEY -t incident-command:<version> .
```

Docker reads the value from the environment, so the key is not in the command line. Push the image to a private registry that your platform can pull from.

A build on a cloud builder uses the key only when the builder gives it to `docker build` as a build argument. Without the key, each build makes a new key. Examine the build settings of your platform.
