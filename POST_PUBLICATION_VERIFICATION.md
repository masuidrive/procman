# Post-Publication Verification Plan for @masuidrive/procman v0.1.0

## Overview

This document outlines the comprehensive verification process to validate the successful publication of @masuidrive/procman v0.1.0 to npm and confirm all functionality works as expected in a clean environment.

## Immediate Verification Steps

### 1. NPM Registry Verification
```bash
# Check package is available on npm registry
npm view @masuidrive/procman

# Expected output should include:
# - name: '@masuidrive/procman'
# - version: '0.1.0'
# - description: 'A lightweight process management daemon tool for development environments'
# - main: 'dist/src/cli/index.js'
# - bin: { procman: 'dist/src/cli/index.js' }

# Check package homepage
npm home @masuidrive/procman
# Should open: https://github.com/masuidrive/procman#readme
```

### 2. GitHub Release Verification
- Visit https://github.com/masuidrive/procman/releases
- Verify "Release v0.1.0" is created
- Check release notes include installation instructions
- Confirm source code archives are attached

### 3. GitHub Actions Workflow Verification  
- Check https://github.com/masuidrive/procman/actions
- Verify "Publish to NPM" workflow completed successfully
- Review workflow logs for any warnings or issues

## Functional Verification Tests

### Test Environment Setup
Create a fresh test environment to simulate user installation:

```bash
# Create a temporary project directory
mkdir /tmp/procman-test-install
cd /tmp/procman-test-install

# Initialize a basic Node.js project
npm init -y
```

### 4. Local Package Installation Test

#### 4.1 Local Development Installation
```bash
# Install as a local dependency
npm install @masuidrive/procman

# Verify installation
ls node_modules/@masuidrive/
cat node_modules/@masuidrive/procman/package.json | grep version

# Test Node.js require/import
node -e "const procman = require('@masuidrive/procman'); console.log('Import successful');"
```

#### 4.2 Global CLI Installation Test
```bash
# Install globally  
npm install -g @masuidrive/procman

# Verify CLI is available
which procman
procman --version
# Expected: 0.1.0

procman --help
# Should display help information without errors
```

### 5. Basic Functionality Verification

#### 5.1 CLI Command Tests
```bash
# Test basic CLI commands (should not crash)
procman help
procman status
procman list

# Test error handling for invalid commands
procman invalid-command
# Should show appropriate error message
```

#### 5.2 Configuration File Test
```bash
# Create a basic configuration file
cat > procman.config.js << 'EOF'
module.exports = {
  namespace: 'test',
  processes: {
    'hello-world': {
      command: 'node',
      args: ['-e', 'console.log("Hello World"); setTimeout(() => {}, 1000);'],
      log: {
        enabled: true,
        level: 'info'
      }
    }
  }
};
EOF

# Load configuration (should not error)
procman load procman.config.js

# Start a process
procman start hello-world

# Check process status
procman status hello-world

# View logs
procman log hello-world --lines 5

# Stop process
procman stop hello-world

# Clean up
procman stop -a
rm procman.config.js
```

### 6. TypeScript Definitions Verification

#### 6.1 TypeScript Project Test
```bash
# Create a TypeScript test file
npm install -D typescript @types/node

cat > test-types.ts << 'EOF'
import { ProcessInfo } from '@masuidrive/procman';

const process: ProcessInfo = {
  name: 'test',
  status: 'running',
  pid: 12345,
  cpu: 0.1,
  memory: 1024
};

console.log('TypeScript types work correctly:', process);
EOF

# Compile TypeScript
npx tsc --noEmit test-types.ts
# Should complete without type errors

# Clean up
rm test-types.ts
```

### 7. Cross-Platform Verification

#### 7.1 Platform-Specific Features
```bash
# Test IPC communication (platform-agnostic)
procman status > /dev/null
echo "IPC communication: $([[ $? -eq 0 ]] && echo 'OK' || echo 'FAILED')"

# Test memory monitoring
procman help | grep -q "memory"
echo "Memory monitoring docs: $([[ $? -eq 0 ]] && echo 'OK' || echo 'FAILED')"
```

## Package Quality Verification

### 8. Package Contents Verification
```bash
# Download and inspect package contents
npm pack @masuidrive/procman
tar -tzf masuidrive-procman-0.1.0.tgz > package-contents.txt

# Verify no test files are included
grep -c "test\|spec" package-contents.txt
# Expected: 0

# Verify essential files are included
grep -q "dist/src/cli/index.js" package-contents.txt && echo "✅ Main entry point included"
grep -q "dist/src/cli/index.d.ts" package-contents.txt && echo "✅ TypeScript definitions included"
grep -q "README.md" package-contents.txt && echo "✅ README included"
grep -q "LICENSE" package-contents.txt && echo "✅ LICENSE included"

# Check package size is reasonable
du -h masuidrive-procman-0.1.0.tgz
# Should be around 275KB

# Clean up
rm masuidrive-procman-0.1.0.tgz package-contents.txt
```

### 9. Dependency Security Check
```bash
# Check for known vulnerabilities
npm audit --audit-level=moderate

# Expected: No moderate/high/critical vulnerabilities
```

## User Experience Verification

### 10. Documentation Accessibility
```bash
# Test npm documentation links
npm docs @masuidrive/procman
# Should open GitHub README

npm repo @masuidrive/procman  
# Should open GitHub repository

npm bugs @masuidrive/procman
# Should open GitHub issues page
```

### 11. Installation Time Performance
```bash
# Measure installation time
time npm install @masuidrive/procman
# Should complete in reasonable time (< 30 seconds on normal connection)
```

## Rollback Preparation

### 12. Rollback Readiness Check
```bash
# Verify npm whoami works (for potential unpublish)
npm whoami
# Should return the publishing account name

# Check publication time (for 24-hour unpublish window)
npm view @masuidrive/procman time
```

## Test Cleanup

### 13. Environment Cleanup
```bash
# Remove global installation
npm uninstall -g @masuidrive/procman

# Clean up test directory
cd /tmp
rm -rf procman-test-install

# Verify removal
which procman
# Expected: command not found
```

## Verification Checklist

After running all tests, confirm:

- [ ] Package is available on npm registry
- [ ] GitHub release is created with proper notes
- [ ] GitHub Actions workflow completed successfully
- [ ] Local installation works correctly
- [ ] Global CLI installation works correctly
- [ ] Basic CLI commands execute without errors
- [ ] Configuration loading and process management works
- [ ] TypeScript definitions are valid and usable
- [ ] Package contains only necessary files (no tests)
- [ ] Package size is optimized (around 275KB)
- [ ] No security vulnerabilities in dependencies
- [ ] Documentation links work correctly
- [ ] Installation time is acceptable

## Success Criteria

The publication is considered successful when:

1. ✅ All checklist items above are confirmed
2. ✅ No critical errors occur during any verification step
3. ✅ Users can successfully install and use the package
4. ✅ TypeScript integration works without issues
5. ✅ Basic process management functionality operates correctly

## Failure Response

If any critical issues are discovered:

1. **Document the issue** with reproduction steps
2. **Assess impact** - does it prevent basic usage?
3. **Consider rollback** if within 24-hour window
4. **Create hotfix** if rollback isn't possible
5. **Update CHANGELOG.md** with known issues
6. **Communicate** to stakeholders about the issue

---

**Note**: This verification should be performed immediately after tag creation and publication to ensure quick response to any issues.