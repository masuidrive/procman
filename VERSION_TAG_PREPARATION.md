# Version Tag Preparation Process for v0.1.0

## Overview

This document outlines the process to create and push the v0.1.0 version tag for @masuidrive/procman npm package. The tag will trigger the automated GitHub Actions workflow for npm publication.

## Current Status

✅ **Package Verification Completed**
- Package size: 275.1 kB (optimized - 44% smaller after excluding tests)
- Total files: 315 (production files only - no test files included)
- npm pack verification passed
- npm publish --dry-run passed successfully

✅ **Pre-publication Checks Completed**
- Build: ✅ TypeScript compilation successful
- Lint: ✅ ESLint passes with no errors
- Package structure: ✅ Only necessary files included (dist/src, README.md, LICENSE)

## Version Tag Creation Process

### Step 1: Final Verification
Before creating the tag, ensure:
- All changes are committed to git
- Working directory is clean
- You're on the target branch (feature/250806-084936-e2e-advanced-scenarios-fix)

### Step 2: Create the Git Tag
```bash
# Create an annotated tag for v0.1.0
git tag -a v0.1.0 -m "Release v0.1.0 - Initial public release

Process management daemon with CLI interface
- Process lifecycle management
- Memory-based auto restart
- Structured log aggregation  
- Cross-platform IPC support
- TypeScript definitions included"

# Verify the tag was created
git tag -l "v0.1.0"
git show v0.1.0
```

### Step 3: Push the Tag to Trigger GitHub Actions
```bash
# Push the tag to remote repository
git push origin v0.1.0
```

## What Happens After Tag Push

### GitHub Actions Workflow (.github/workflows/npm-publish.yml)
The workflow will automatically:

1. **Setup Environment**
   - Checkout code at the tagged commit
   - Setup Node.js 18.x
   - Install dependencies with `npm ci`

2. **Quality Checks**
   - Run linter: `npm run lint`
   - Run tests: `npm run test` 
   - Build project: `npm run build`
   - Run integration tests: `npm run test:integration`

3. **Publication**
   - Publish to npm: `npm publish` (using NPM_TOKEN secret)
   - Create GitHub Release with automated release notes

### Required Secrets
The workflow requires these GitHub Secrets to be configured:
- `NPM_TOKEN`: npm authentication token for @masuidrive scope
- `GITHUB_TOKEN`: automatically provided by GitHub for release creation

## Expected Results

### NPM Package
- **Package Name**: @masuidrive/procman
- **Version**: 0.1.0
- **Registry**: https://registry.npmjs.org/
- **Access**: Public
- **Tag**: latest

### GitHub Release
- **Title**: Release v0.1.0
- **Body**: Automated release notes with installation instructions
- **Assets**: Source code archives (automatically generated)

## Installation Verification Commands

After successful publication, users will be able to install via:

```bash
# Local installation
npm install @masuidrive/procman

# Global CLI installation  
npm install -g @masuidrive/procman

# Verify installation
procman --version
# Should output: 0.1.0
```

## Rollback Process

If issues are discovered after publication:

### Within 24 hours
```bash
# npm allows unpublishing within 24 hours
npm unpublish @masuidrive/procman@0.1.0
```

### After 24 hours
- Cannot unpublish, must publish a new patch version
- Delete the GitHub release manually if needed
- Document issues in CHANGELOG.md for next version

## Next Steps After Tag Creation

1. **Monitor GitHub Actions**: Check the workflow execution in the GitHub repository
2. **Verify Publication**: Check https://www.npmjs.com/package/@masuidrive/procman
3. **Test Installation**: Install in a fresh project to verify functionality
4. **Update Documentation**: Mark the ticket as completed
5. **Announce Release**: Share with stakeholders if applicable

## Troubleshooting

### Common Issues and Solutions

**GitHub Actions Fails**
- Check workflow logs in the Actions tab
- Verify NPM_TOKEN secret is correctly set
- Ensure package.json version matches tag (0.1.0)

**NPM Authentication Errors**  
- Verify NPM_TOKEN has correct permissions for @masuidrive scope
- Check token hasn't expired

**Build/Test Failures**
- Local `npm run lint && npm run build && npm run test` should pass
- Fix any issues before recreating the tag

**Tag Already Exists**
```bash
# Delete local tag
git tag -d v0.1.0

# Delete remote tag (if pushed)
git push --delete origin v0.1.0

# Recreate with corrections
git tag -a v0.1.0 -m "Updated release message"
```

---

**Important**: Do not create the actual tag until explicitly instructed. This document serves as preparation and reference material.