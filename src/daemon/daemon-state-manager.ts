/**
 * Daemon State Manager - 状態管理の専門クラス
 *
 * デーモンの状態遷移を管理し、適切な状態変化を保証する。
 * Single Responsibility Principle に従って状態管理のみに特化。
 */

import { EventEmitter } from 'events';

/**
 * Daemon state enumeration
 */
export enum DaemonState {
  STOPPED = 'stopped',
  STARTING = 'starting',
  RUNNING = 'running',
  STOPPING = 'stopping',
  ERROR = 'error',
  RECOVERING = 'recovering',
}

/**
 * State change event interface
 */
export interface StateChangeEvent {
  from: DaemonState;
  to: DaemonState;
  timestamp: number;
}

/**
 * Events emitted by DaemonStateManager
 */
export interface DaemonStateManagerEvents {
  stateChange: (event: StateChangeEvent) => void;
  enterError: (previousState: DaemonState) => void;
  exitError: (newState: DaemonState) => void;
}

/**
 * Valid state transitions
 */
const VALID_TRANSITIONS: Record<DaemonState, DaemonState[]> = {
  [DaemonState.STOPPED]: [DaemonState.STARTING],
  [DaemonState.STARTING]: [DaemonState.RUNNING, DaemonState.ERROR],
  [DaemonState.RUNNING]: [DaemonState.STOPPING, DaemonState.ERROR],
  [DaemonState.STOPPING]: [DaemonState.STOPPED, DaemonState.ERROR],
  [DaemonState.ERROR]: [DaemonState.RECOVERING, DaemonState.STOPPED],
  [DaemonState.RECOVERING]: [
    DaemonState.RUNNING,
    DaemonState.ERROR,
    DaemonState.STOPPED,
  ],
};

/**
 * Daemon state manager class
 *
 * Handles daemon state transitions with validation and event emission.
 * Provides error recovery paths and prevents invalid state transitions.
 */
export class DaemonStateManager extends EventEmitter {
  private currentState: DaemonState = DaemonState.STOPPED;
  private stateHistory: StateChangeEvent[] = [];
  private readonly maxHistorySize = 100;

  /**
   * Get current state
   */
  getCurrentState(): DaemonState {
    return this.currentState;
  }

  /**
   * Check if daemon is in a specific state
   */
  isInState(state: DaemonState): boolean {
    return this.currentState === state;
  }

  /**
   * Check if daemon is running
   */
  isRunning(): boolean {
    return this.currentState === DaemonState.RUNNING;
  }

  /**
   * Check if daemon is in error state
   */
  isInError(): boolean {
    return this.currentState === DaemonState.ERROR;
  }

  /**
   * Check if daemon can be started
   */
  canStart(): boolean {
    return this.currentState === DaemonState.STOPPED;
  }

  /**
   * Check if daemon can be stopped
   */
  canStop(): boolean {
    return (
      this.currentState === DaemonState.RUNNING ||
      this.currentState === DaemonState.ERROR
    );
  }

  /**
   * Transition to new state with validation
   */
  transitionTo(newState: DaemonState): void {
    const validTransitions = VALID_TRANSITIONS[this.currentState];

    if (!validTransitions.includes(newState)) {
      throw new Error(
        `Invalid state transition from ${this.currentState} to ${newState}. ` +
          `Valid transitions: ${validTransitions.join(', ')}`
      );
    }

    const oldState = this.currentState;
    const timestamp = Date.now();

    this.currentState = newState;

    // Create state change event
    const stateChangeEvent: StateChangeEvent = {
      from: oldState,
      to: newState,
      timestamp,
    };

    // Add to history
    this.addToHistory(stateChangeEvent);

    // Emit events
    this.emit('stateChange', stateChangeEvent);

    // Special handling for error state
    if (newState === DaemonState.ERROR) {
      this.emit('enterError', oldState);
    } else if (oldState === DaemonState.ERROR) {
      this.emit('exitError', newState);
    }
  }

  /**
   * Force transition to error state (bypasses validation)
   */
  forceError(): void {
    const oldState = this.currentState;
    this.currentState = DaemonState.ERROR;

    const stateChangeEvent: StateChangeEvent = {
      from: oldState,
      to: DaemonState.ERROR,
      timestamp: Date.now(),
    };

    this.addToHistory(stateChangeEvent);
    this.emit('stateChange', stateChangeEvent);
    this.emit('enterError', oldState);
  }

  /**
   * Initiate error recovery
   */
  beginRecovery(): void {
    if (this.currentState !== DaemonState.ERROR) {
      throw new Error(`Cannot begin recovery from state: ${this.currentState}`);
    }

    this.transitionTo(DaemonState.RECOVERING);
  }

  /**
   * Complete successful recovery
   */
  completeRecovery(): void {
    if (this.currentState !== DaemonState.RECOVERING) {
      throw new Error(
        `Cannot complete recovery from state: ${this.currentState}`
      );
    }

    this.transitionTo(DaemonState.RUNNING);
  }

  /**
   * Fail recovery and return to error
   */
  failRecovery(): void {
    if (this.currentState !== DaemonState.RECOVERING) {
      throw new Error(`Cannot fail recovery from state: ${this.currentState}`);
    }

    this.transitionTo(DaemonState.ERROR);
  }

  /**
   * Get state history
   */
  getStateHistory(): StateChangeEvent[] {
    return [...this.stateHistory];
  }

  /**
   * Get last state change
   */
  getLastStateChange(): StateChangeEvent | undefined {
    return this.stateHistory[this.stateHistory.length - 1];
  }

  /**
   * Reset to initial state (mainly for testing)
   */
  reset(): void {
    this.currentState = DaemonState.STOPPED;
    this.stateHistory = [];
    this.removeAllListeners();
  }

  /**
   * Add state change to history
   */
  private addToHistory(event: StateChangeEvent): void {
    this.stateHistory.push(event);

    // Maintain history size limit
    if (this.stateHistory.length > this.maxHistorySize) {
      this.stateHistory.shift();
    }
  }

  /**
   * Override EventEmitter methods for type safety
   */

  emit<K extends keyof DaemonStateManagerEvents>(
    event: K,
    ...args: any[]
  ): boolean {
    return super.emit(event, ...args);
  }

  on<K extends keyof DaemonStateManagerEvents>(
    event: K,
    listener: (...args: any[]) => void
  ): this {
    return super.on(event, listener);
  }
}
