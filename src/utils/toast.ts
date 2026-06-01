export const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
  // Original implementation of showToast utility
  console.log(`[Toast] ${type.toUpperCase()}: ${message}`);
  // In this NHGOne architecture, toasts are often handled via state or custom events.
  // This utility provides a compatible interface for components.
};
