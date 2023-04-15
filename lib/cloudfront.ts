import { CfnOutput, Fn, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import {
  AllowedMethods,
  Distribution,
  OriginAccessIdentity,
  OriginProtocolPolicy,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { HttpOrigin, S3Origin } from "aws-cdk-lib/aws-cloudfront-origins";
import {
  CanonicalUserPrincipal,
  Effect,
  PolicyStatement,
} from "aws-cdk-lib/aws-iam";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import { Construct } from "constructs";
import path = require("path");

interface CustomStackProps extends StackProps {
  stage: string;
}

export class FibonacciCloudfrontStack extends Stack {
  constructor(scope: Construct, id: string, props: CustomStackProps) {
    super(scope, id, props);

    // Importing ALB domain name
    const loadBalancerDomain = Fn.importValue("fibonacciApiLoadBalancerUrl");

    // Getting external configuration values from cdk.json file
    const config = this.node.tryGetContext("stages")[props.stage];

    // SSL certificate
    const certificateArn = Certificate.fromCertificateArn(
      this,
      "tlsCertificate",
      config.domainCertificateArn
    );

    // Web hosting bucket
    let websiteBucket = new Bucket(this, "fibonacciFrontendBucket", {
      versioned: false,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Create Origin Access Identity for CloudFront
    const originAccessIdentity = new OriginAccessIdentity(
      this,
      "cloudfrontOAI",
      {
        comment: "OAI for web application cloudfront distribution",
      }
    );

    // update the bucket policy to allow via OAI
    websiteBucket.addToResourcePolicy(
      new PolicyStatement({
        actions: ["s3:GetObject"],
        effect: Effect.ALLOW,
        principals: [
          new CanonicalUserPrincipal(
            originAccessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId
          ),
        ],
        resources: [`${websiteBucket.bucketArn}/*`],
      })
    );

    // Creating CloudFront distribution
    let cloudFrontDist = new Distribution(this, "cloudfrontDist", {
      defaultRootObject: "index.html",
      domainNames: config.domainNames.split(","),
      certificate: certificateArn,
      defaultBehavior: {
        origin: new S3Origin(websiteBucket, {
          originAccessIdentity: originAccessIdentity,
        }),
        compress: true,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
    });

    // Creating custom origin for the application load balancer
    const loadBalancerOrigin = new HttpOrigin(loadBalancerDomain, {
      protocolPolicy: OriginProtocolPolicy.HTTP_ONLY,
    });

    // Creating the path pattern to direct to the load balancer origin
    cloudFrontDist.addBehavior("/generate/*", loadBalancerOrigin, {
      compress: true,
      viewerProtocolPolicy: ViewerProtocolPolicy.ALLOW_ALL,
      allowedMethods: AllowedMethods.ALLOW_ALL,
    });

    // Trigger frontend deployment
    new BucketDeployment(this, "websiteDeployment", {
      sources: [Source.asset(path.resolve(__dirname, "../frontend/build"))],
      destinationBucket: websiteBucket,
    });

    new CfnOutput(this, "cloudfrontDomainUrl", {
      value: cloudFrontDist.distributionDomainName,
      exportName: "cloudfrontDomainUrl",
    });
  }
}
