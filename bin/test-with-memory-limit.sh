#!/bin/bash

# Test runner with memory limit
# Uses cgroups v2 to limit memory usage to 1GB

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Running tests with 1GB memory limit...${NC}"

# Check if we're in a Docker container
if [ ! -f /.dockerenv ]; then
    echo -e "${YELLOW}⚠️  Not running in Docker container, using Node.js memory limit instead${NC}"
    # Use Node.js --max-old-space-size flag (in MB)
    NODE_OPTIONS="--max-old-space-size=1024" npx vitest "$@"
    exit $?
fi

# Check if cgroups v2 is available
if [ -f /sys/fs/cgroup/cgroup.controllers ]; then
    echo -e "${GREEN}✓ Cgroups v2 detected${NC}"
    
    # Create a new cgroup for the test process
    CGROUP_NAME="vitest_limit_$$"
    CGROUP_PATH="/sys/fs/cgroup/${CGROUP_NAME}"
    
    # Try to create cgroup (may fail if not root)
    if sudo mkdir -p "${CGROUP_PATH}" 2>/dev/null; then
        echo -e "${GREEN}✓ Created cgroup: ${CGROUP_NAME}${NC}"
        
        # Set memory limit to 1GB
        echo "1073741824" | sudo tee "${CGROUP_PATH}/memory.max" > /dev/null
        echo "1073741824" | sudo tee "${CGROUP_PATH}/memory.high" > /dev/null
        
        # Add current shell to the cgroup
        echo $$ | sudo tee "${CGROUP_PATH}/cgroup.procs" > /dev/null
        
        echo -e "${GREEN}✓ Memory limit set to 1GB${NC}"
        
        # Run vitest
        npx vitest "$@"
        EXIT_CODE=$?
        
        # Clean up cgroup
        sudo rmdir "${CGROUP_PATH}" 2>/dev/null || true
        
        exit $EXIT_CODE
    else
        echo -e "${YELLOW}⚠️  Cannot create cgroup (not running as root)${NC}"
    fi
fi

# Fallback: Use ulimit (less reliable but works without root)
echo -e "${YELLOW}⚠️  Using ulimit for memory restriction (soft limit)${NC}"

# Set virtual memory limit to 1.5GB (ulimit is less precise)
# Using 1.5GB to account for overhead
ulimit -v 1572864  # 1.5GB in KB

# Also use Node.js memory limit as additional safeguard
NODE_OPTIONS="--max-old-space-size=1024" npx vitest "$@"