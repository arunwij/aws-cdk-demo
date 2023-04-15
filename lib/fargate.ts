import * as cdk from "aws-cdk-lib";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import { Platform } from "aws-cdk-lib/aws-ecr-assets";
import { Cluster, ContainerImage } from "aws-cdk-lib/aws-ecs";
import { ApplicationLoadBalancedFargateService } from "aws-cdk-lib/aws-ecs-patterns";
import { Construct } from "constructs";
import path = require("path");
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class FibonacciFargateApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC
    const vpc = new Vpc(this, `fibonacciApiVpc`, {
      maxAzs: 2,
      natGateways: 1,
    });

    // Fargate cluster
    const cluster = new Cluster(this, "fibonacciApiCluster", {
      vpc: vpc,
    });

    // Fargate Service
    const backendService = new ApplicationLoadBalancedFargateService(
      this,
      "fibonacciApiBackendService",
      {
        cluster: cluster,
        memoryLimitMiB: 1024,
        cpu: 512,
        desiredCount: 2,
        taskImageOptions: {
          image: ContainerImage.fromAsset(
            path.resolve(__dirname, "../backend"),
            { platform: Platform.LINUX_AMD64 }
          ),
          environment: {},
        },
      }
    );

    // Health check
    backendService.targetGroup.configureHealthCheck({ path: "/health" });

    new cdk.CfnOutput(this, "fibonacciApiLoadBalancerUrl", {
      value: backendService.loadBalancer.loadBalancerDnsName,
      exportName: "fibonacciApiLoadBalancerUrl",
    });
  }
}
