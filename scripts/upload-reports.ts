#!/usr/bin/env ts-node
// scripts/upload-reports.ts
// Uploads test reports to Azure Blob Storage
// Usage: ts-node scripts/upload-reports.ts [site-name]

import * as fs from 'fs';
import * as path from 'path';

import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';

interface UploadConfig {
  siteName: string;
  date: string;
  accountName: string;
  accountKey: string;
  containerName: string;
}

function getConfig(): UploadConfig {
  const siteName = process.argv[2] || process.env.SITE_NAME || 'imagemakers';
  const date = new Date().toISOString().slice(0, 10);

  const accountName = process.env.AZURE_STORAGE_ACCOUNT;
  const accountKey = process.env.AZURE_STORAGE_KEY;
  const containerName = process.env.AZURE_STORAGE_CONTAINER || 'test-reports';

  if (!accountName || !accountKey) {
    throw new Error(
      'Missing Azure credentials. Set AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_KEY environment variables.',
    );
  }

  return { siteName, date, accountName, accountKey, containerName };
}

interface ReportMapping {
  sourcePattern: string;
  destName: string;
}

function getReportMappings(date: string): ReportMapping[] {
  return [
    { sourcePattern: `perf-summary-${date}.json`, destName: 'performance.json' },
    { sourcePattern: `accessibility-${date}.json`, destName: 'accessibility.json' },
    { sourcePattern: `seo-${date}.json`, destName: 'seo.json' },
    { sourcePattern: `functional-visual-${date}.json`, destName: 'functional.json' },
  ];
}

async function uploadToAzure(config: UploadConfig): Promise<void> {
  const { siteName, date, accountName, accountKey, containerName } = config;

  // Create blob service client
  const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
  const blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    sharedKeyCredential,
  );

  const containerClient = blobServiceClient.getContainerClient(containerName);

  // Ensure container exists
  try {
    await containerClient.createIfNotExists();
    console.log(`Container '${containerName}' ready`);
  } catch {
    console.warn('Container may already exist or insufficient permissions');
  }

  const reportsDir = path.resolve(process.cwd(), 'reports');
  const mappings = getReportMappings(date);

  let uploadCount = 0;

  for (const mapping of mappings) {
    const sourceFile = path.join(reportsDir, mapping.sourcePattern);

    if (!fs.existsSync(sourceFile)) {
      console.log(
        `⚠️  Skipping ${mapping.destName} - source file not found: ${mapping.sourcePattern}`,
      );
      continue;
    }

    const blobName = `${siteName}/${date}/${mapping.destName}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    try {
      const fileContent = fs.readFileSync(sourceFile);
      await blockBlobClient.upload(fileContent, fileContent.length, {
        blobHTTPHeaders: { blobContentType: 'application/json' },
      });

      console.log(`✅ Uploaded: ${blobName}`);
      uploadCount++;
    } catch (err) {
      console.error(`❌ Failed to upload ${blobName}:`, err);
    }
  }

  console.log(`\n📊 Summary: Uploaded ${uploadCount} of ${mappings.length} reports`);
  console.log(`📍 Location: ${containerName}/${siteName}/${date}/`);
}

async function main() {
  try {
    console.log('🚀 Starting Azure Blob Storage upload...\n');

    const config = getConfig();
    console.log(`Site: ${config.siteName}`);
    console.log(`Date: ${config.date}`);
    console.log(`Container: ${config.containerName}`);
    console.log(`Account: ${config.accountName}\n`);

    await uploadToAzure(config);

    console.log('\n✨ Upload complete!');
  } catch (err) {
    console.error('❌ Upload failed:', err);
    process.exit(1);
  }
}

main();
