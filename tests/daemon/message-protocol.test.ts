/**
 * Message Protocol Tests
 *
 * Tests for basic message serialization, deserialization, and message parsing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MessageProtocol,
  MessageBuffer,
  MessageSerializer,
  MessageDeserializer,
  createMessageProtocol,
  MESSAGE_DELIMITER,
  validateMessageSize,
  estimateMessageSize,
} from '../../src/daemon/message-protocol';
import type { IPCMessage, CommandPayload } from '../../src/shared/ipc';

// Helper function to create IPC messages
function createIPCMessage(type: string, payload: unknown): IPCMessage {
  return {
    id: `test-${Date.now()}-${Math.random()}`,
    type: 'load', // Using a valid CommandType
    payload: payload as CommandPayload,
    timestamp: Date.now(),
  };
}

describe('Message Protocol', () => {
  let protocol: MessageProtocol;

  beforeEach(() => {
    protocol = createMessageProtocol();
  });

  describe('Basic Functionality', () => {
    it('should encode and decode simple messages', () => {
      const message = createIPCMessage('test', { data: 'hello world' });

      const encoded = protocol.encode(message);
      expect(encoded).toBeInstanceOf(Buffer);

      const decoded = protocol.decode(encoded);
      expect(decoded).toHaveLength(1);
      expect(decoded[0]).toEqual(message);
    });

    it('should handle multiple messages in sequence', () => {
      const messages = [
        createIPCMessage('test1', { data: 'message1' }),
        createIPCMessage('test2', { data: 'message2' }),
        createIPCMessage('test3', { data: 'message3' }),
      ];

      let combinedBuffer = Buffer.alloc(0);
      for (const message of messages) {
        const encoded = protocol.encode(message);
        combinedBuffer = Buffer.concat([combinedBuffer, encoded]);
      }

      const decoded = protocol.decode(combinedBuffer);
      expect(decoded).toHaveLength(3);
      expect(decoded).toEqual(messages);
    });

    it('should handle partial messages correctly', () => {
      const message = createIPCMessage('test', { data: 'partial test' });
      const encoded = protocol.encode(message);
      const encodedStr = encoded.toString('utf8');

      // Split the encoded message into parts
      const part1 = encodedStr.substring(0, encodedStr.length / 2);
      const part2 = encodedStr.substring(encodedStr.length / 2);

      // Process first part (should return empty array)
      const decoded1 = protocol.decode(part1);
      expect(decoded1).toHaveLength(0);

      // Process second part (should return the complete message)
      const decoded2 = protocol.decode(part2);
      expect(decoded2).toHaveLength(1);
      expect(decoded2[0]).toEqual(message);
    });

    it('should handle concatenated JSON messages', () => {
      const message1 = createIPCMessage('test1', { data: 'message1' });
      const message2 = createIPCMessage('test2', { data: 'message2' });

      // Create concatenated JSON without delimiters (simulating PoC issue)
      const json1 = JSON.stringify(message1);
      const json2 = JSON.stringify(message2);
      const concatenatedJson = json1 + json2 + MESSAGE_DELIMITER;

      const decoded = protocol.decode(concatenatedJson);
      expect(decoded).toHaveLength(2);
      expect(decoded[0]).toEqual(message1);
      expect(decoded[1]).toEqual(message2);
    });
  });

  describe('MessageBuffer', () => {
    let buffer: MessageBuffer;

    beforeEach(() => {
      buffer = new MessageBuffer();
    });

    it('should handle buffer size limit', () => {
      const smallBuffer = new MessageBuffer(MESSAGE_DELIMITER, 100);
      const largeData = 'A'.repeat(200);

      expect(() => {
        smallBuffer.push(largeData);
      }).toThrow('Message buffer exceeded maximum size');
    });

    it('should clear buffer correctly', () => {
      const message = createIPCMessage('test', { data: 'test data' });
      const encoded = JSON.stringify(message);

      // Add partial message
      buffer.push(encoded.substring(0, encoded.length / 2));
      expect(buffer.getBufferSize()).toBeGreaterThan(0);

      // Clear buffer
      buffer.clear();
      expect(buffer.getBufferSize()).toBe(0);
    });

    it('should handle empty and whitespace-only messages', () => {
      const messages = buffer.push('   \n\n  \n');
      expect(messages).toHaveLength(0);
    });
  });

  describe('MessageSerializer', () => {
    let serializer: MessageSerializer;

    beforeEach(() => {
      serializer = new MessageSerializer();
    });

    it('should serialize messages with delimiter', () => {
      const message = createIPCMessage('test', { data: 'test' });
      const buffer = serializer.serialize(message);
      const text = buffer.toString('utf8');

      expect(text).toContain(JSON.stringify(message));
      expect(text.endsWith(MESSAGE_DELIMITER)).toBe(true);
    });

    it('should handle serialization errors', () => {
      // Create an object with circular reference
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const circular: any = { data: 'test' };
      circular.self = circular;

      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        serializer.serialize(circular as any);
      }).toThrow('Failed to serialize message');
    });
  });

  describe('MessageDeserializer', () => {
    let deserializer: MessageDeserializer;

    beforeEach(() => {
      deserializer = new MessageDeserializer();
    });

    it('should deserialize valid messages', () => {
      const message = createIPCMessage('test', { data: 'test' });
      const json = JSON.stringify(message) + MESSAGE_DELIMITER;

      const messages = deserializer.push(json);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(message);
    });

    it('should ignore invalid JSON', () => {
      const invalidJson = 'invalid json' + MESSAGE_DELIMITER;
      const validMessage = createIPCMessage('test', { data: 'test' });
      const validJson = JSON.stringify(validMessage) + MESSAGE_DELIMITER;

      const messages = deserializer.push(invalidJson + validJson);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(validMessage);
    });

    it('should validate IPC message structure', () => {
      const invalidMessage = { invalid: 'structure' };
      const json = JSON.stringify(invalidMessage) + MESSAGE_DELIMITER;

      const messages = deserializer.push(json);
      expect(messages).toHaveLength(0);
    });
  });

  describe('Utility Functions', () => {
    it('should validate message size correctly', () => {
      const smallMessage = createIPCMessage('test', { data: 'small' });
      expect(validateMessageSize(smallMessage)).toBe(true);

      const largeMessage = createIPCMessage('test', {
        data: 'A'.repeat(1024 * 1024 + 1), // Larger than 1MB
      });
      expect(validateMessageSize(largeMessage)).toBe(false);

      // Test with custom limit
      expect(validateMessageSize(smallMessage, 10)).toBe(false);
    });

    it('should estimate message size correctly', () => {
      const message = createIPCMessage('test', { data: 'test data' });
      const expectedSize = JSON.stringify(message).length;

      expect(estimateMessageSize(message)).toBe(expectedSize);
    });

    it('should handle invalid objects in utility functions', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const circular: any = { data: 'test' };
      circular.self = circular;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(validateMessageSize(circular as any)).toBe(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(estimateMessageSize(circular as any)).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON gracefully', () => {
      const malformedJson =
        '{"id":"test","type":"command","incomplete":' + MESSAGE_DELIMITER;

      const messages = protocol.decode(malformedJson);
      expect(messages).toHaveLength(0);
    });

    it('should handle mixed valid and invalid messages', () => {
      const validMessage = createIPCMessage('test', { data: 'valid' });
      const validJson = JSON.stringify(validMessage);
      const mixedData =
        validJson + '\n{"invalid":"json"}\n' + validJson + MESSAGE_DELIMITER;

      const messages = protocol.decode(mixedData);
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual(validMessage);
      expect(messages[1]).toEqual(validMessage);
    });
  });
});
