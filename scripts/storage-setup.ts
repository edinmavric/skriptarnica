import 'dotenv/config';

import { CreateBucketCommand, HeadBucketCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3';

import { env } from '@/env';
import { buckets, s3 } from '@/server/storage/s3';

/**
 * Creates the buckets and the CORS rule that lets browsers PUT directly to the private
 * bucket (presigned uploads). Production R2 buckets are configured once in the Cloudflare
 * dashboard (see RUNBOOK.md); this script is for local/CI storage.
 */
async function ensureBucket(name: string) {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: name }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: name }));
    console.log(`created bucket ${name}`);
  }
}

async function main() {
  await ensureBucket(buckets.private);
  await ensureBucket(buckets.public);
  await s3.send(
    new PutBucketCorsCommand({
      Bucket: buckets.private,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: [env.NEXT_PUBLIC_APP_URL],
            AllowedMethods: ['PUT'],
            AllowedHeaders: ['content-type', 'content-length'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
  console.log('storage ready');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
