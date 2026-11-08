# Later option: AWS storage

This is a future cost and operations note. It is not part of the Split v4 release gates. V4 initially uses Liveblocks and local IndexedDB, as specified in [DESIGN.md](DESIGN.md).

## Possible uses

- **Backup:** A scheduled Lambda can export each Liveblocks room's binary Yjs document and save versioned snapshots to a private S3 bucket. This adds recovery against provider or device loss but is a separate operational job. [Liveblocks Yjs document API](https://liveblocks.io/docs/api-reference/rest-api-endpoints).
- **Replace Liveblocks:** Reuse the versioned event format and the `GroupStore` contract. Do not store one mutable JSON file per group without conflict handling. S3 accepts conditional writes based on ETags, but it cannot atomically update multiple objects; compare-and-retry logic and an event index would still be needed. Evaluate a transactional store such as DynamoDB if writes need a single authoritative order. [S3 concurrent writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html), [S3 conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html).

## Deployment and cost

For a small AWS API, AWS SAM is an open-source, first-party declarative deployment tool. SST is a TypeScript alternative. Choose deployment tooling only after the storage protocol is designed; neither tool makes data migration automatic. [AWS SAM](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/), [SST](https://sst.dev/docs).

Lambda currently includes 1 million requests and 400,000 GB-seconds per month in its free tier. S3 charges separately for storage, requests, and transfer; API Gateway's free usage is time-limited for new accounts. Estimate real request and storage volume before committing to a vendor or assuming a million users will be free. [Lambda pricing](https://aws.amazon.com/lambda/pricing/), [S3 pricing](https://aws.amazon.com/s3/pricing/), [API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/).
