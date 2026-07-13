# Daily Test Reporting Workflow

This workflow runs all test suites daily and uploads the results to Azure Blob Storage.

## Report Structure

Reports are organized in Azure Blob Storage with the following structure:

```
{container-name}/
  └── {site-name}/
      └── {date}/
          ├── performance.json
          ├── accessibility.json
          ├── seo.json
          └── functional.json
```

Example: `test-reports/imagemakers/2025-11-21/performance.json`

## Required Secrets

Configure the following secrets in your GitHub repository:

### Azure Storage Credentials

1. **`AZURE_STORAGE_ACCOUNT`** - Your Azure Storage account name
2. **`AZURE_STORAGE_KEY`** - Your Azure Storage account access key

### Optional Variables

- **`AZURE_STORAGE_CONTAINER`** (default: `test-reports`) - The blob container name

## Setup Instructions

### 1. Create Azure Storage Account

```bash
# Login to Azure
az login

# Create resource group (if needed)
az group create --name rg-test-reports --location eastus

# Create storage account
az storage account create \
  --name yourstorageaccount \
  --resource-group rg-test-reports \
  --location eastus \
  --sku Standard_LRS

# Create container
az storage container create \
  --name test-reports \
  --account-name yourstorageaccount
```

### 2. Get Storage Account Key

```bash
az storage account keys list \
  --account-name yourstorageaccount \
  --resource-group rg-test-reports \
  --query "[0].value" -o tsv
```

### 3. Configure GitHub Secrets

1. Go to your repository Settings → Secrets and variables → Actions
2. Add the following secrets:
   - `AZURE_STORAGE_ACCOUNT`: Your storage account name
   - `AZURE_STORAGE_KEY`: The key from step 2

### 4. (Optional) Configure Variables

If you want to use a different container name:

1. Go to Settings → Secrets and variables → Actions → Variables tab
2. Add: `AZURE_STORAGE_CONTAINER` with your container name

## Running the Workflow

### Scheduled Run

The workflow runs automatically every day at 6 AM UTC.

### Manual Run

You can manually trigger the workflow from the Actions tab:

1. Go to Actions → Daily Test Reporting
2. Click "Run workflow"
3. Optionally specify a different site name (default: `imagemakers`)

## Report Formats

### Performance Report (`performance.json`)

```json
{
  "date": "2025-11-21",
  "pages": [
    {
      "url": "https://example.com/",
      "label": "Homepage",
      "lcp": 1234.5,
      "cls": 0.05,
      "inp": 100,
      "lh_score": 95
    }
  ]
}
```

### Accessibility Report (`accessibility.json`)

```json
{
  "date": "2025-11-21",
  "scan_id": "a11y-scan-1732147200000",
  "violations": [
    {
      "fingerprint": "page=/about|selector=.header|rule=color-contrast",
      "page": "/about",
      "component": ".header",
      "issue": "Elements must have sufficient color contrast",
      "severity": "serious",
      "wcag_ref": "WCAG 2.1 Level AA"
    }
  ]
}
```

### SEO Report (`seo.json`)

```json
{
  "date": "2025-11-21",
  "pages": [
    {
      "url": "https://example.com/",
      "has_title": true,
      "has_meta_description": true,
      "canonical": "https://example.com/",
      "robots_index": true,
      "sitemap_present": true
    }
  ]
}
```

### Functional Report (`functional.json`)

```json
{
  "date": "2025-11-21",
  "functional": {
    "total": 15,
    "failed": 2,
    "failures": [
      {
        "test_id": "checkout flow completes",
        "area": "e2e/checkout.spec.ts",
        "severity": "critical"
      }
    ]
  },
  "visual": {
    "total": 8,
    "failed": 1,
    "failures": [
      {
        "component": "homepage hero section",
        "area": "visual/homepage.spec.ts",
        "severity": "medium"
      }
    ]
  }
}
```

## Accessing Reports

### Using Azure Portal

1. Navigate to your Storage Account in Azure Portal
2. Go to Containers → `test-reports`
3. Browse to `{site-name}/{date}/`

### Using Azure CLI

```bash
# List reports for a specific date
az storage blob list \
  --account-name yourstorageaccount \
  --container-name test-reports \
  --prefix "imagemakers/2025-11-21/" \
  --output table

# Download a specific report
az storage blob download \
  --account-name yourstorageaccount \
  --container-name test-reports \
  --name "imagemakers/2025-11-21/performance.json" \
  --file "./performance.json"
```

### Using Azure Storage Explorer

Download and use [Azure Storage Explorer](https://azure.microsoft.com/en-us/products/storage/storage-explorer/) for a GUI experience.

## Troubleshooting

### Workflow fails with "az: command not found"

The `azure/CLI@v2` action includes the Azure CLI. If you see this error, ensure you're using the action correctly.

### Authentication errors

Verify that:

- `AZURE_STORAGE_ACCOUNT` secret is set to your storage account name (not the full URL)
- `AZURE_STORAGE_KEY` secret contains a valid access key
- The storage account and container exist

### Reports not generated

Check the workflow logs for individual test failures. Tests use `continue-on-error: true`, so the workflow will complete even if some tests fail.

## Local Testing

To test uploading reports locally:

```bash
# Install dependencies (if not already done)
npm install

# Set environment variables
export AZURE_STORAGE_ACCOUNT="yourstorageaccount"
export AZURE_STORAGE_KEY="your-key-here"
export AZURE_STORAGE_CONTAINER="test-reports"
export SITE_NAME="imagemakers"

# Run tests to generate reports
npm run test:perf
npm run test:a11y
npm run test:seo
npm run test:functional

# Upload to Azure using TypeScript script
npm run upload:reports

# Or with a custom site name
npm run upload:reports -- mysite
```

### Upload Script

The upload is handled by `scripts/upload-reports.ts`, which:

- Reads reports from the `reports/` directory
- Renames them to standardized names (performance.json, accessibility.json, etc.)
- Uploads directly to Azure Blob Storage with the path structure: `{site}/{date}/{report}.json`
- Can be run locally or in CI/CD

The script accepts an optional site name argument or uses the `SITE_NAME` environment variable (defaults to `imagemakers`).
