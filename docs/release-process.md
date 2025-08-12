# Release Process

This document outlines the complete release process for @masuidrive/procman package.

## Overview

The @masuidrive/procman package follows semantic versioning and uses GitHub Actions for automated npm publishing. Releases are triggered by pushing version tags to the repository.

## Semantic Versioning Strategy

We follow [Semantic Versioning (SemVer)](https://semver.org/) specification:

- **MAJOR** version (X.0.0): Breaking changes that require user intervention
- **MINOR** version (0.X.0): New features that are backward compatible
- **PATCH** version (0.0.X): Bug fixes and improvements that are backward compatible

### Version Examples

- `0.1.0` → `0.1.1`: Bug fix (PATCH)
- `0.1.0` → `0.2.0`: New feature (MINOR)
- `0.1.0` → `1.0.0`: Breaking changes (MAJOR)

## Release Types

### 1. Manual Release (Recommended for initial releases)

For the first release or when you need full control:

```bash
# 1. Update version in package.json
npm version patch|minor|major

# 2. Update CHANGELOG.md with new version details

# 3. Commit changes
git add .
git commit -m "chore: prepare release v0.1.0"

# 4. Create and push tag
git tag v0.1.0
git push origin main --tags

# 5. Monitor GitHub Actions for automatic publishing
```

### 2. Automated Release (via GitHub Actions)

Once tags are pushed, GitHub Actions will automatically:

1. Run linting and tests
2. Build the project
3. Publish to npm
4. Create GitHub release

## Pre-Release Checklist

Before creating any release, ensure the following:

### Code Quality
- [ ] All unit tests pass (`npm run test`)
- [ ] All integration tests pass (`npm run test:integration`)
- [ ] All E2E tests pass (if applicable)
- [ ] ESLint passes without errors (`npm run lint`)
- [ ] Code has been reviewed and approved

### Documentation
- [ ] README.md is up to date
- [ ] CHANGELOG.md includes new version entry
- [ ] API documentation reflects changes
- [ ] Migration guides written (for breaking changes)

### Package Configuration
- [ ] package.json version is updated
- [ ] package.json metadata is complete and accurate
- [ ] .npmignore excludes unnecessary files
- [ ] Build outputs are correct (`npm run build`)

### Dependencies
- [ ] Dependencies are up to date
- [ ] Security vulnerabilities addressed (`npm audit`)
- [ ] Unused dependencies removed

### Testing
- [ ] Test package locally (`npm pack` and install in test project)
- [ ] Verify CLI works globally when installed
- [ ] Verify TypeScript types are correct
- [ ] Test installation in different Node.js environments

## GitHub Secrets Setup

### Required Secrets

1. **NPM_TOKEN**: npm authentication token for publishing
2. **GITHUB_TOKEN**: Automatically provided by GitHub Actions

### Setting up NPM_TOKEN

1. Log in to your npm account
2. Go to **Access Tokens** in your npm account settings
3. Click **Generate New Token**
4. Choose **Automation** token type
5. Copy the generated token
6. In GitHub repository settings:
   - Go to **Settings** → **Secrets and variables** → **Actions**
   - Click **New repository secret**
   - Name: `NPM_TOKEN`
   - Value: Paste your npm token
   - Click **Add secret**

### NPM Scope Access

Ensure you have publishing permissions for the `@masuidrive` scope:

```bash
# Check current user
npm whoami

# Check scope access
npm access ls-packages @masuidrive

# Grant access if needed (as scope owner)
npm access grant read-write @masuidrive:developers <username>
```

## Release Workflow

### Step 1: Prepare Release

1. Create a new branch for release preparation:
   ```bash
   git checkout -b release/v0.1.0
   ```

2. Update version in package.json:
   ```bash
   npm version --no-git-tag-version patch
   ```

3. Update CHANGELOG.md with new version details

4. Test the package build:
   ```bash
   npm run build
   npm pack
   ```

5. Verify package contents:
   ```bash
   tar -tzf masuidrive-procman-0.1.0.tgz
   ```

### Step 2: Quality Assurance

Run all tests and checks:

```bash
# Run all tests
npm run test
npm run test:integration

# Run linting
npm run lint

# Build for production
npm run build

# Verify TypeScript types
npm run type-check
```

### Step 3: Create Release

1. Commit and push release preparation:
   ```bash
   git add .
   git commit -m "chore: prepare release v0.1.0"
   git push origin release/v0.1.0
   ```

2. Create pull request and get approval

3. Merge to main branch

4. Tag the release:
   ```bash
   git checkout main
   git pull origin main
   git tag v0.1.0
   git push origin main --tags
   ```

### Step 4: Monitor Release

1. Watch GitHub Actions workflow
2. Verify npm package is published
3. Test installation from npm:
   ```bash
   npm install @masuidrive/procman
   ```

## Post-Release Tasks

### Verification

1. Test package installation:
   ```bash
   # In a test directory
   mkdir test-install && cd test-install
   npm init -y
   npm install @masuidrive/procman
   ```

2. Test global CLI installation:
   ```bash
   npm install -g @masuidrive/procman
   procman --version
   ```

3. Verify GitHub release is created
4. Check npm package page for correct metadata

### Communication

1. Update project documentation
2. Announce release in relevant channels
3. Update examples and tutorials if needed

## Troubleshooting

### Failed GitHub Actions

1. Check workflow logs in GitHub Actions tab
2. Common issues:
   - Missing or invalid NPM_TOKEN
   - Test failures
   - Build errors
   - Network connectivity issues

### Failed npm Publish

1. Check npm token permissions
2. Verify package name availability
3. Check for version conflicts
4. Ensure 2FA is configured correctly

### Rollback Process

If a release has critical issues:

1. **Within 24 hours**: Use npm unpublish
   ```bash
   npm unpublish @masuidrive/procman@0.1.0
   ```

2. **After 24 hours**: Create a patch release with fixes
   ```bash
   npm version patch
   # Fix issues, then release 0.1.1
   ```

## Version History Template

Add to CHANGELOG.md:

```markdown
## [0.1.0] - 2025-08-12

### Added
- Initial release
- Process management functionality
- Memory monitoring
- IPC communication system
- CLI interface

### Changed
- N/A (initial release)

### Deprecated
- N/A (initial release)

### Removed
- N/A (initial release)

### Fixed
- N/A (initial release)

### Security
- N/A (initial release)
```

## References

- [Semantic Versioning](https://semver.org/)
- [npm Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [npm CLI Documentation](https://docs.npmjs.com/cli/v10)