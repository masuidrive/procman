/**
 * Component Manager Types - interfaces and type definitions
 */

/**
 * Events emitted by ComponentManager
 */
export interface ComponentManagerEvents {
  componentStarted: (componentName: string) => void;
  componentStopped: (componentName: string) => void;
  componentError: (componentName: string, error: Error) => void;
  allComponentsStarted: () => void;
  allComponentsStopped: () => void;
}

/**
 * Component manager interface
 */
export interface Component {
  name: string;
  initialize(): Promise<void>;
  cleanup(): Promise<void>;
  isInitialized(): boolean;
}
