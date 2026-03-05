/**
 * Validation Suggestions
 *
 * Generates helpful suggestions for configuration validation errors.
 */

/**
 * Generate suggestions for validation errors
 * @param errorCode Error code
 * @param field Field name (optional)
 * @returns Array of suggestions
 */
export function generateSuggestions(
  errorCode: string,
  field?: string
): string[] {
  const suggestions: string[] = [];

  switch (errorCode) {
    case 'CONFIG_VALIDATION_ERROR':
      if (field === 'name') {
        suggestions.push(
          'Use only alphanumeric characters, dashes, and underscores'
        );
        suggestions.push('Ensure the name is unique across all apps');
      } else if (field === 'script') {
        suggestions.push('Provide the full command to execute');
        suggestions.push('Use absolute paths for executables if needed');
      } else if (field === 'max_memory_restart') {
        suggestions.push('Use format like "300M", "1G", or "512000K"');
        suggestions.push('Ensure the unit (K/M/G) is specified');
      }
      break;

    case 'CONFIG_SECURITY_ERROR':
      suggestions.push('Use relative paths within the project directory');
      suggestions.push('Avoid ".." in paths to prevent directory traversal');
      suggestions.push('Use absolute paths only when explicitly needed');
      break;

    default:
      suggestions.push('Check the configuration documentation');
      suggestions.push('Verify all required fields are present');
  }

  return suggestions;
}
