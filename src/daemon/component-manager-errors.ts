/**
 * Component Manager Errors - error handling classes
 */

/**
 * Component initialization error
 */
export class ComponentInitializationError extends Error {
  constructor(
    public componentName: string,
    public originalError: Error
  ) {
    super(
      `Failed to initialize component '${componentName}': ${originalError.message}`
    );
    this.name = 'ComponentInitializationError';
  }
}

/**
 * Component cleanup error
 */
export class ComponentCleanupError extends Error {
  constructor(
    public componentName: string,
    public originalError: Error
  ) {
    super(
      `Failed to cleanup component '${componentName}': ${originalError.message}`
    );
    this.name = 'ComponentCleanupError';
  }
}
