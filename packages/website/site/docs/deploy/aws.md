---
title: AWS
navTitle: AWS
description: Run Incident Command on Amazon ECS Fargate or AWS App Runner, with RDS for PostgreSQL, Secrets Manager and SES for email.
order: 6
---

This guide runs the app on Amazon ECS Fargate, or on AWS App Runner for current App Runner customers. The database is RDS for PostgreSQL, Secrets Manager keeps the secrets, and SES sends email.

> AWS App Runner is closed to new customers. Current customers can continue to use it and create new services. For new customers, AWS recommends [Amazon ECS Express Mode](https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html). This guide gives the full steps for ECS Fargate.

The repository has two files for this guide:

- [`deploy/aws/iam-policy.json`](https://github.com/jaredwray/incident-command/blob/main/deploy/aws/iam-policy.json): the SES and Secrets Manager permissions.
- [`deploy/aws/ecs-task-definition.json`](https://github.com/jaredwray/incident-command/blob/main/deploy/aws/ecs-task-definition.json): the ECS task definition.

## Before you start

- AWS CLI v2, configured with `aws configure` or SSO.
- Docker, to copy the image to Amazon ECR or to build an image.
- A clone of the repository, for the files above and for a build from source.
- A VPC with at least two private subnets. If the app runs in the VPC, these subnets need a NAT gateway for outbound internet access. The app sends webhooks and email, and ECS pulls the image from Docker Hub.

```bash
export AWS_REGION=us-east-1
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export REPO=$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/incident-command
```

## Select the image

Replace `<version>` with a release version, for example `1.2.3`, in the commands on this page.

### ECS Fargate

ECS can pull public images from Docker Hub. In the task definition, set the `image` of the `app` container:

```json
"image": "jaredwray/incident-command:<version>"
```

A Fargate task needs a route to the internet to pull the image. In a private subnet, a NAT gateway gives this route.

### App Runner

App Runner pulls images only from Amazon ECR and Amazon ECR Public. Copy the Docker Hub image to a private ECR repository:

```bash
aws ecr create-repository --repository-name incident-command
aws ecr get-login-password | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
docker pull --platform linux/amd64 jaredwray/incident-command:<version>
docker tag jaredwray/incident-command:<version> $REPO:<version>
docker push $REPO:<version>
```

### Build from source

Create the ECR repository and log in as above. Then build from the repository root and push the image:

```bash
docker build --platform linux/amd64 -t $REPO:<version> .
docker push $REPO:<version>
```

For a private server action key, put `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` in the environment, and add `--build-arg NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` to `docker build`. The key stays private while the image stays in your private repository. See [Secrets and key rotation](/docs/operate/secrets/).

ECS can also use this image. Set `image` in the task definition to `$REPO:<version>`, with the real values of the variables.

## Create the database

RDS for PostgreSQL is the recommended database:

```bash
aws rds create-db-instance \
  --db-instance-identifier incident-command-db \
  --engine postgres \
  --db-instance-class db.t4g.micro \
  --allocated-storage 20 \
  --db-name incident_command \
  --master-username incident \
  --master-user-password 'CHOOSE_A_DB_PASSWORD' \
  --db-subnet-group-name YOUR_DB_SUBNET_GROUP \
  --vpc-security-group-ids sg-DATABASE \
  --no-publicly-accessible
aws rds wait db-instance-available --db-instance-identifier incident-command-db
DB_HOST=$(aws rds describe-db-instances --db-instance-identifier incident-command-db \
  --query 'DBInstances[0].Endpoint.Address' --output text)
export DATABASE_URI="postgresql://incident:CHOOSE_A_DB_PASSWORD@$DB_HOST:5432/incident_command?uselibpqcompat=true&sslmode=require"
```

RDS requires TLS, and the RDS CA is not in the trust store of Node.js. `uselibpqcompat=true&sslmode=require` encrypts the connection, but the app does not verify the certificate chain. See [Databases](/docs/operate/databases/).

The database security group must allow port 5432 from the security group of the app. The app creates its tables on the first start.

**DocumentDB:** it is compatible with MongoDB, but not identical, so test it before you use it. It needs these settings:

- `retryWrites=false` in the connection string.
- TLS with the Amazon CA bundle. The image does not include this bundle. Extend the image with the bundle, and add `tlsCAFile=` to the URL.

RDS for PostgreSQL is the simpler choice.

## Set the secrets

```bash
DB_SECRET_ARN=$(aws secretsmanager create-secret --name incident-command/database-url \
  --secret-string "$DATABASE_URI" --query ARN --output text)
SETUP_SECRET_ARN=$(aws secretsmanager create-secret --name incident-command/setup-token \
  --secret-string 'CHOOSE_A_LONG_TOKEN' --query ARN --output text)
```

Add other secrets the same way, then map them to their variables:

- `incident-command/encryption-key` for `ENCRYPTION_KEY`. Make the value with `openssl rand -base64 32`. It encrypts the notification provider credentials that admins save in the portal.
- `incident-command/webhook-secret` for `WEBHOOK_SECRET`.

For all variables, see [Environment variables](/docs/reference/environment-variables/).

### Send email with SES

```bash
aws sesv2 create-email-identity --email-identity example.com   # then add the DKIM CNAMEs it returns to DNS
```

- Set `EMAIL_FROM` (an address on the verified domain) and `AWS_SES_REGION`. `AWS_SES_REGION` also selects SES automatically. With only `AWS_REGION`, you must also set `EMAIL_PROVIDER=ses`.
- Do not set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. The SDK then uses the IAM role of the service. The role needs `ses:SendEmail` ([`iam-policy.json`](https://github.com/jaredwray/incident-command/blob/main/deploy/aws/iam-policy.json)).
- For text messages through Amazon SNS with the IAM role, give the role `sns:Publish`. Then add an Amazon SNS provider without keys in **Settings → Notifications**.
- A new SES account is in the sandbox and can send only to verified addresses. Request production access in the SES console.

## Deploy

### ECS Fargate

Create the cluster, the log group and the IAM roles:

```bash
aws ecs create-cluster --cluster-name incident-command
aws logs create-log-group --log-group-name /ecs/incident-command

TRUST='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
# Execution role: pull the image, write logs, read secrets
aws iam create-role --role-name incident-command-ecs-execution --assume-role-policy-document "$TRUST"
aws iam attach-role-policy --role-name incident-command-ecs-execution \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
aws iam put-role-policy --role-name incident-command-ecs-execution \
  --policy-name incident-command --policy-document file://deploy/aws/iam-policy.json
# Task role: what the app itself can do (SES)
aws iam create-role --role-name incident-command-ecs-task --assume-role-policy-document "$TRUST"
aws iam put-role-policy --role-name incident-command-ecs-task \
  --policy-name incident-command --policy-document file://deploy/aws/iam-policy.json
```

Edit [`deploy/aws/ecs-task-definition.json`](https://github.com/jaredwray/incident-command/blob/main/deploy/aws/ecs-task-definition.json):

1. Replace `<version>` in `image` with a release version, or set `image` to your ECR image.
2. Replace `ACCOUNT_ID` and `REGION`.
3. Replace the secret ARNs with the values of `$DB_SECRET_ARN` and `$SETUP_SECRET_ARN`.
4. Set the values in `environment`.

The task definition uses `X86_64`, because the image is `linux/amd64`. Register it, and create the service:

```bash
aws ecs register-task-definition --cli-input-json file://deploy/aws/ecs-task-definition.json

TG_ARN=$(aws elbv2 create-target-group --name incident-command --protocol HTTP --port 3000 \
  --target-type ip --vpc-id vpc-XXX --health-check-path /healthz \
  --query 'TargetGroups[0].TargetGroupArn' --output text)
# Create (or reuse) an internet-facing ALB with an HTTPS listener forwarding to $TG_ARN.

aws ecs create-service --cluster incident-command --service-name incident-command \
  --task-definition incident-command --desired-count 1 --launch-type FARGATE \
  --network-configuration 'awsvpcConfiguration={subnets=[subnet-AAA,subnet-BBB],securityGroups=[sg-APP],assignPublicIp=DISABLED}' \
  --load-balancers targetGroupArn=$TG_ARN,containerName=app,containerPort=3000
```

### App Runner

This section is for current App Runner customers. The service uses the image in your ECR repository.

```bash
# Role App Runner uses to pull from ECR
aws iam create-role --role-name incident-command-apprunner-ecr --assume-role-policy-document \
  '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"build.apprunner.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam attach-role-policy --role-name incident-command-apprunner-ecr \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess

# Role the running app uses (SES + secrets)
aws iam create-role --role-name incident-command-apprunner-instance --assume-role-policy-document \
  '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"tasks.apprunner.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam put-role-policy --role-name incident-command-apprunner-instance \
  --policy-name incident-command --policy-document file://deploy/aws/iam-policy.json

# VPC connector so the service can reach RDS in private subnets
VPC_CONNECTOR_ARN=$(aws apprunner create-vpc-connector --vpc-connector-name incident-command \
  --subnets subnet-AAA subnet-BBB --security-groups sg-APP \
  --query VpcConnector.VpcConnectorArn --output text)
```

Write the service configuration. Replace `<version>` in `ImageIdentifier`:

```bash
cat > /tmp/apprunner-service.json <<EOF
{
  "ServiceName": "incident-command",
  "SourceConfiguration": {
    "ImageRepository": {
      "ImageIdentifier": "$REPO:<version>",
      "ImageRepositoryType": "ECR",
      "ImageConfiguration": {
        "Port": "3000",
        "RuntimeEnvironmentVariables": {
          "SITE_URL": "https://status.example.com",
          "EMAIL_FROM": "status@example.com",
          "AWS_SES_REGION": "$AWS_REGION"
        },
        "RuntimeEnvironmentSecrets": {
          "DATABASE_URI": "$DB_SECRET_ARN",
          "SETUP_TOKEN": "$SETUP_SECRET_ARN"
        }
      }
    },
    "AuthenticationConfiguration": {
      "AccessRoleArn": "arn:aws:iam::$ACCOUNT_ID:role/incident-command-apprunner-ecr"
    },
    "AutoDeploymentsEnabled": true
  },
  "InstanceConfiguration": {
    "Cpu": "1 vCPU",
    "Memory": "2 GB",
    "InstanceRoleArn": "arn:aws:iam::$ACCOUNT_ID:role/incident-command-apprunner-instance"
  },
  "HealthCheckConfiguration": {
    "Protocol": "HTTP", "Path": "/healthz",
    "Interval": 10, "Timeout": 5, "HealthyThreshold": 1, "UnhealthyThreshold": 10
  },
  "NetworkConfiguration": {
    "EgressConfiguration": { "EgressType": "VPC", "VpcConnectorArn": "$VPC_CONNECTOR_ARN" }
  }
}
EOF
aws apprunner create-service --cli-input-json file:///tmp/apprunner-service.json
```

`AutoDeploymentsEnabled` deploys again when you push a new image to the same tag.

## Set SITE_URL and the domain

For ECS Fargate:

1. Point the DNS name of the status page at the ALB. The HTTPS listener of the ALB needs a certificate for this name.
2. Set `SITE_URL` in the `environment` of the task definition.
3. Register the task definition again, and update the service (see [Upgrade](#upgrade)).

For App Runner, set `SITE_URL` to the `ServiceUrl` of the service, or to your custom domain. Use `aws apprunner update-service` or the console.

## Upgrade

For ECS Fargate:

1. Change the tag in `image` in the task definition.
2. Register the task definition again.
3. Update the service. ECS uses the newest revision of the task definition.

```bash
aws ecs register-task-definition --cli-input-json file://deploy/aws/ecs-task-definition.json
aws ecs update-service --cluster incident-command --service incident-command \
  --task-definition incident-command
```

If you pushed a new image to the same ECR tag, the task definition does not change. Start new tasks with this command:

```bash
aws ecs update-service --cluster incident-command --service incident-command --force-new-deployment
```

For App Runner, copy or build the new version into ECR, as in [Select the image](#select-the-image). Then change the image of the service to the new tag in the console, or with `aws apprunner update-service`. See [Upgrades and backups](/docs/operate/upgrades/).

## Scale

- App Runner scales on concurrent requests with the default auto scaling configuration. ECS scales with `--desired-count` or with Service Auto Scaling.
- Each instance has its own cache. With more than one instance, public reads can be up to `CACHE_TTL` (default `30s`) old.
- Each instance keeps its own Postgres connection pool. Make sure that the connection limit of the RDS instance is sufficient.
- `/healthz` stays at 200 (`"status":"degraded"`) when the database stops after boot. Thus App Runner and ECS keep instances that still serve cached data. It returns 503 only when the app cannot start, for example when it cannot reach the database at boot.

See [Health, cache and scale](/docs/operate/scaling/).

## Next steps

Create the first admin and check the server: [After you deploy](/docs/deploy/after-deploy/).
