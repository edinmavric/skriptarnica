import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { env } from '@/env';

/**
 * Object storage (Cloudflare R2 via the S3 API; SeaweedFS locally). The private bucket holds
 * original PDFs and watermarked copies and is only reachable through short-lived presigned
 * URLs. The public bucket holds preview images and avatars (served via CDN).
 */
export const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

export const buckets = { private: env.S3_PRIVATE_BUCKET, public: env.S3_PUBLIC_BUCKET } as const;

/** Presigned PUT bound to an exact key, content type and byte length (SPEC §7.1). */
export async function presignUpload(
  key: string,
  contentType: string,
  contentLength: number,
  expiresInSeconds = 600,
): Promise<string> {
  return getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: buckets.private,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
    }),
    { expiresIn: expiresInSeconds, signableHeaders: new Set(['content-type', 'content-length']) },
  );
}

/** Short-lived download URL (SPEC §4.3: 60 seconds) with an attachment filename. */
export async function presignDownload(
  key: string,
  filename: string,
  expiresInSeconds = 60,
): Promise<string> {
  const encoded = encodeURIComponent(filename);
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: buckets.private,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${filename.replace(/[^\x20-\x7e]|"/g, '_')}"; filename*=UTF-8''${encoded}`,
      ResponseContentType: 'application/pdf',
    }),
    { expiresIn: expiresInSeconds },
  );
}

export async function headObject(
  bucket: string,
  key: string,
): Promise<{ size: number; contentType: string | undefined } | null> {
  try {
    const result = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { size: result.ContentLength ?? 0, contentType: result.ContentType };
  } catch (error) {
    if (
      (error as { name?: string }).name === 'NotFound' ||
      (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404
    ) {
      return null;
    }
    throw error;
  }
}

async function bodyToBuffer(output: GetObjectCommandOutput): Promise<Buffer> {
  if (!output.Body) return Buffer.alloc(0);
  return Buffer.from(await output.Body.transformToByteArray());
}

export async function readObject(bucket: string, key: string): Promise<Buffer> {
  return bodyToBuffer(await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key })));
}

export async function readObjectRange(
  bucket: string,
  key: string,
  start: number,
  end: number,
): Promise<Buffer> {
  return bodyToBuffer(
    await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=${start}-${end}` }),
    ),
  );
}

export async function writeObject(
  bucket: string,
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
  cacheControl?: string,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ...(cacheControl ? { CacheControl: cacheControl } : {}),
    }),
  );
}

export async function deleteObject(bucket: string, key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export function publicUrl(key: string): string {
  return `${env.NEXT_PUBLIC_STORAGE_PUBLIC_URL}/${key}`;
}
