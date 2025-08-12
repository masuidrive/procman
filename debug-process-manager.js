// Debug script for ProcessManager.create()
import { ProcessManager } from './src/process-manager/process-manager.js';

console.log('ProcessManager import:', ProcessManager);
console.log('ProcessManager.create function:', ProcessManager.create);

try {
  const instance = ProcessManager.create();
  console.log('ProcessManager instance:', instance);
  console.log('Instance has start method:', typeof instance.start);
  console.log('Instance prototype:', Object.getPrototypeOf(instance));
  console.log('Instance constructor:', instance.constructor.name);
} catch (error) {
  console.error('Error creating ProcessManager:', error);
}