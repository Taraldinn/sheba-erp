import '@testing-library/jest-dom/vitest';

// Silence noisy console warnings during tests.
const originalWarn = console.warn;
console.warn = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('React Router')) return;
    originalWarn(...args);
};