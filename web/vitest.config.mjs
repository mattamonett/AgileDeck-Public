import { defineConfig } from 'vitest/config';

// The throw-scene specs step full 3D animations frame by frame. When every core runs a
// spec file they take up to ~5s, the Vitest default, so allow headroom for busy machines.
export default defineConfig({
  test: { testTimeout: 20_000 },
});
