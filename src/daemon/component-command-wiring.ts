/**
 * Component Command Wiring - registers IPC command handlers and sets up streaming
 */

import { EventEmitter } from 'events';
import { IPCServerBase } from './ipc-server-base.js';
import { IPCCommandHandler } from './ipc-command-handler.js';
import { LogManager } from '../services/log-manager.js';
import { CommandType } from '../shared/ipc.js';
import { StreamingSessionManager } from './component-streaming.js';

/**
 * Register all command handlers with the IPC server and set up log streaming.
 */
export function wireCommandHandlers(options: {
  ipcServer: IPCServerBase;
  commandHandler: IPCCommandHandler;
  logManager: LogManager;
  streamingManager: StreamingSessionManager;
  registerListener: <T extends EventEmitter>(
    emitter: T,
    event: string | symbol,
    listener: (...args: any[]) => void
  ) => void;
}): void {
  const {
    ipcServer,
    commandHandler,
    logManager,
    streamingManager,
    registerListener,
  } = options;

  const commandTypes: CommandType[] = [
    'load',
    'start',
    'stop',
    'restart',
    'list',
    'log',
    'clear-log',
    'exit',
  ];

  for (const commandType of commandTypes) {
    ipcServer.registerHandler(commandType, async (message, connection) => {
      return commandHandler.handleMessage(message, connection);
    });
  }

  // Setup log streaming via streaming manager
  streamingManager.setupLogStreaming(
    commandHandler,
    ipcServer,
    logManager,
    registerListener
  );
}
