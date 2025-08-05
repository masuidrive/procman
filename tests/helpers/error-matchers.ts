/**
 * Custom error matchers for test assertions
 * Following t_wada's principle: Assert on behaviors, not implementation details
 */

import { expect } from 'vitest';
import {
  ProcmanError,
  ErrorCode,
  isProcmanError,
} from '../../src/shared/errors';

/**
 * Custom matcher to check if an error is a ProcmanError with specific code
 */
expect.extend({
  toProcmanError(received: unknown, expectedCode?: ErrorCode) {
    const pass =
      isProcmanError(received) &&
      (expectedCode === undefined || received.code === expectedCode);

    if (pass) {
      return {
        pass: true,
        message: () =>
          expectedCode
            ? `Expected error not to be ProcmanError with code ${expectedCode}`
            : `Expected error not to be ProcmanError`,
      };
    } else {
      const actualCode = isProcmanError(received) ? received.code : 'N/A';
      return {
        pass: false,
        message: () =>
          expectedCode
            ? `Expected error to be ProcmanError with code ${expectedCode}, but got ${actualCode}`
            : `Expected error to be ProcmanError, but got ${received}`,
      };
    }
  },

  toThrowProcmanError(received: () => unknown, expectedCode?: ErrorCode) {
    let thrownError: unknown;
    let didThrow = false;

    try {
      received();
    } catch (error) {
      thrownError = error;
      didThrow = true;
    }

    const pass =
      didThrow &&
      isProcmanError(thrownError) &&
      (expectedCode === undefined || thrownError.code === expectedCode);

    if (pass) {
      return {
        pass: true,
        message: () =>
          expectedCode
            ? `Expected function not to throw ProcmanError with code ${expectedCode}`
            : `Expected function not to throw ProcmanError`,
      };
    } else {
      if (!didThrow) {
        return {
          pass: false,
          message: () =>
            `Expected function to throw ProcmanError, but it didn't throw`,
        };
      }
      const actualCode = isProcmanError(thrownError) ? thrownError.code : 'N/A';
      return {
        pass: false,
        message: () =>
          expectedCode
            ? `Expected function to throw ProcmanError with code ${expectedCode}, but got ${actualCode}`
            : `Expected function to throw ProcmanError, but got ${thrownError}`,
      };
    }
  },

  async toRejectWithProcmanError(
    received: Promise<unknown>,
    expectedCode?: ErrorCode
  ) {
    let rejectedError: unknown;
    let didReject = false;

    try {
      await received;
    } catch (error) {
      rejectedError = error;
      didReject = true;
    }

    const pass =
      didReject &&
      isProcmanError(rejectedError) &&
      (expectedCode === undefined || rejectedError.code === expectedCode);

    if (pass) {
      return {
        pass: true,
        message: () =>
          expectedCode
            ? `Expected promise not to reject with ProcmanError with code ${expectedCode}`
            : `Expected promise not to reject with ProcmanError`,
      };
    } else {
      if (!didReject) {
        return {
          pass: false,
          message: () =>
            `Expected promise to reject with ProcmanError, but it resolved`,
        };
      }
      const actualCode = isProcmanError(rejectedError)
        ? rejectedError.code
        : 'N/A';
      return {
        pass: false,
        message: () =>
          expectedCode
            ? `Expected promise to reject with ProcmanError with code ${expectedCode}, but got ${actualCode}`
            : `Expected promise to reject with ProcmanError, but got ${rejectedError}`,
      };
    }
  },
});

// TypeScript declarations for the custom matchers
declare module 'vitest' {
  interface Assertion<T = any> {
    toProcmanError(expectedCode?: ErrorCode): void;
    toThrowProcmanError(expectedCode?: ErrorCode): void;
    toRejectWithProcmanError(expectedCode?: ErrorCode): Promise<void>;
  }
  interface AsymmetricMatchersContaining {
    toProcmanError(expectedCode?: ErrorCode): any;
    toThrowProcmanError(expectedCode?: ErrorCode): any;
    toRejectWithProcmanError(expectedCode?: ErrorCode): any;
  }
}
