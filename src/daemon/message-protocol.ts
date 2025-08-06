/**
 * IPC Message Protocol Implementation
 *
 * Handles serialization, deserialization, and proper parsing of IPC messages.
 * Addresses the PoC issue with consecutive message parsing by implementing
 * proper message framing and delimiter handling.
 */

import type { IPCMessage } from '../shared/ipc.js';
import { IDisposable } from './resource-manager.js';

/**
 * Message delimiter used to separate messages in the stream
 */
export const MESSAGE_DELIMITER = '\n';

/**
 * Maximum message size in bytes (1MB)
 */
export const MAX_MESSAGE_SIZE = 1024 * 1024;

/**
 * Message buffer for handling partial messages
 */
export class MessageBuffer implements IDisposable {
  private buffer = '';
  private readonly delimiter: string;
  private readonly maxSize: number;

  constructor(delimiter = MESSAGE_DELIMITER, maxSize = MAX_MESSAGE_SIZE) {
    this.delimiter = delimiter;
    this.maxSize = maxSize;
  }

  /**
   * Add data to the buffer and extract complete messages
   */
  push(data: Buffer | string): IPCMessage[] {
    const text = typeof data === 'string' ? data : data.toString('utf8');
    this.buffer += text;

    const messages: IPCMessage[] = [];
    this.extractDelimitedMessages(messages);

    // Check buffer size to prevent memory issues
    if (this.buffer.length > this.maxSize) {
      this.buffer = '';
      throw new Error(
        `Message buffer exceeded maximum size: ${this.maxSize} bytes`
      );
    }

    return messages;
  }

  /**
   * Extract messages using delimiter-based framing
   */
  private extractDelimitedMessages(messages: IPCMessage[]): void {
    const parts = this.buffer.split(this.delimiter);

    // Keep the last part as it might be incomplete
    this.buffer = parts.pop() || '';

    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed) {
        try {
          const message = this.parseMessage(trimmed);
          if (message) {
            messages.push(message);
          }
        } catch {
          // Try to handle concatenated JSON objects
          this.parseConcatenatedJSON(trimmed, messages);
        }
      }
    }
  }

  /**
   * Parse a single message from text
   */
  private parseMessage(text: string): IPCMessage | null {
    try {
      const parsed = JSON.parse(text);

      // Validate basic IPC message structure
      if (this.isValidIPCMessage(parsed)) {
        return parsed as IPCMessage;
      }

      return null;
    } catch (error) {
      throw new Error(`Failed to parse JSON message: ${error}`);
    }
  }

  /**
   * Handle concatenated JSON objects in a single string
   * This addresses the PoC issue with consecutive message parsing
   */
  private parseConcatenatedJSON(text: string, messages: IPCMessage[]): void {
    // Simple approach: match JSON objects with balanced braces
    const jsonRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
    const matches = text.match(jsonRegex) || [];

    for (const match of matches) {
      try {
        const message = this.parseMessage(match.trim());
        if (message) messages.push(message);
      } catch (error) {
        console.warn(
          `Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`,
          {
            method: 'extractIPCMessages',
            input: match.trim().slice(0, 100), // First 100 chars for debugging
          }
        );
      }
    }
  }

  /**
   * Validate IPC message structure
   */
  private isValidIPCMessage(obj: unknown): obj is IPCMessage {
    return Boolean(
      obj &&
        typeof obj === 'object' &&
        typeof (obj as Record<string, unknown>).id === 'string' &&
        typeof (obj as Record<string, unknown>).type === 'string'
    );
  }

  /**
   * Get current buffer size
   */
  getBufferSize(): number {
    return this.buffer.length;
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.buffer = '';
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.clear();
  }

  /**
   * Check if disposed
   */
  isDisposed(): boolean {
    return false; // MessageBuffer doesn't have complex disposal logic
  }
}

/**
 * Message serializer for encoding IPC messages
 */
export class MessageSerializer {
  private readonly delimiter: string;

  constructor(delimiter = MESSAGE_DELIMITER) {
    this.delimiter = delimiter;
  }

  /**
   * Serialize message to buffer
   */
  serialize(message: IPCMessage): Buffer {
    try {
      const json = JSON.stringify(message);
      const text = json + this.delimiter;
      return Buffer.from(text, 'utf8');
    } catch (error) {
      throw new Error(`Failed to serialize message: ${error}`);
    }
  }
}

/**
 * Message deserializer using MessageBuffer
 */
export class MessageDeserializer extends MessageBuffer {
  constructor(delimiter = MESSAGE_DELIMITER, maxSize = MAX_MESSAGE_SIZE) {
    super(delimiter, maxSize);
  }
}

/**
 * Complete message protocol handler
 */
export class MessageProtocol implements IDisposable {
  private readonly serializer: MessageSerializer;
  private readonly deserializer: MessageDeserializer;

  constructor(delimiter = MESSAGE_DELIMITER, maxSize = MAX_MESSAGE_SIZE) {
    this.serializer = new MessageSerializer(delimiter);
    this.deserializer = new MessageDeserializer(delimiter, maxSize);
  }

  /**
   * Encode a message to buffer
   */
  encode(message: IPCMessage): Buffer {
    return this.serializer.serialize(message);
  }

  /**
   * Decode data and extract messages
   */
  decode(data: Buffer | string): IPCMessage[] {
    return this.deserializer.push(data);
  }

  /**
   * Get current buffer size
   */
  getBufferSize(): number {
    return this.deserializer.getBufferSize();
  }

  /**
   * Clear the decode buffer
   */
  clearBuffer(): void {
    this.deserializer.clear();
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.deserializer.dispose();
  }

  /**
   * Check if disposed
   */
  isDisposed(): boolean {
    return this.deserializer.isDisposed();
  }

  /**
   * Get resource stats
   */
  getResourceStats(): {
    bufferSize: number;
    isDisposed: boolean;
  } {
    return {
      bufferSize: this.getBufferSize(),
      isDisposed: this.isDisposed(),
    };
  }
}

/**
 * Create a message protocol instance
 */
export function createMessageProtocol(
  delimiter = MESSAGE_DELIMITER,
  maxSize = MAX_MESSAGE_SIZE
): MessageProtocol {
  return new MessageProtocol(delimiter, maxSize);
}

/**
 * Utility function to validate message size
 */
export function validateMessageSize(
  message: IPCMessage,
  maxSize = MAX_MESSAGE_SIZE
): boolean {
  try {
    const json = JSON.stringify(message);
    return json.length <= maxSize;
  } catch {
    return false;
  }
}

/**
 * Utility function to estimate message size
 */
export function estimateMessageSize(message: IPCMessage): number {
  try {
    return JSON.stringify(message).length;
  } catch {
    return 0;
  }
}
