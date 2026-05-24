import { describe, expect, it } from 'vitest';

import { ComputerRuntime } from '../../../../../packages/tool-runtime/src/ComputerRuntime';
import type { ServiceResult } from '../../../../../packages/tool-runtime/src/types';

class TestComputerRuntime extends ComputerRuntime {
  constructor(private readonly serviceResult: ServiceResult) {
    super();
  }

  protected async callService(): Promise<ServiceResult> {
    return this.serviceResult;
  }
}

describe('ComputerRuntime command status mapping', () => {
  it('uses command result success when command transport succeeds with non-zero exit code', async () => {
    const runtime = new TestComputerRuntime({
      result: {
        exitCode: 2,
        stderr: 'failed',
        stdout: 'partial',
        success: false,
      },
      success: true,
    });

    const result = await runtime.runCommand({ command: 'exit 2' });

    expect(result).toMatchObject({
      state: {
        exitCode: 2,
        stderr: 'failed',
        stdout: 'partial',
        success: false,
      },
      success: true,
    });
  });

  it('uses command output result success when background task transport succeeds', async () => {
    const runtime = new TestComputerRuntime({
      result: {
        output: 'failed',
        running: false,
        success: false,
      },
      success: true,
    });

    const result = await runtime.getCommandOutput({ commandId: 'task-1' });

    expect(result).toMatchObject({
      state: {
        newOutput: 'failed',
        running: false,
        success: false,
      },
      success: true,
    });
  });
});
