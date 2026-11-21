# Deploy configuration files

The deploy guides are on the documentation site:
<https://incident-command.org/docs/deploy/choose-a-platform/>.

This folder contains the configuration files that the guides use. Run the commands from the
repository root, because the guides use these paths.

| File                                                           | Content                                                                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [`digitalocean/app.yaml`](digitalocean/app.yaml)               | The DigitalOcean App Platform spec. It runs the Docker Hub image and attaches a managed Postgres database.         |
| [`gcp/cloudbuild.yaml`](gcp/cloudbuild.yaml)                   | The Cloud Build config. It builds the image, pushes it to Artifact Registry and deploys it to a Cloud Run service. |
| [`aws/ecs-task-definition.json`](aws/ecs-task-definition.json) | The Amazon ECS task definition for Fargate.                                                                        |
| [`aws/iam-policy.json`](aws/iam-policy.json)                   | The IAM policy for SES email and for the Secrets Manager secrets of the app.                                       |

The `Dockerfile` and `docker-compose.yml` are at the repository root.
