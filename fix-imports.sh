#\!/bin/bash

# Find all TypeScript files and fix relative imports to add .js extension
find src -name "*.ts" -type f | while read file; do
  # Fix relative imports (from './xxx' or from '../xxx')
  sed -i "s/from '\(\.\.[\/\.]*[^']*\)'/from '\1.js'/g" "$file"
  sed -i 's/from "\(\.\.[\/\.]*[^"]*\)"/from "\1.js"/g' "$file"
  
  # Remove double .js.js if accidentally created
  sed -i "s/\.js\.js/\.js/g" "$file"
  
  # Fix imports that already have .js to not add another one
  sed -i "s/\.js\.js/\.js/g" "$file"
done

echo "Fixed imports in all TypeScript files"
