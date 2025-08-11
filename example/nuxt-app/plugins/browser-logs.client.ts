export default defineNuxtPlugin(() => {
  // Only run in client-side and dev mode
  if (!process.client || !process.dev) return;
  
  console.log('[Nuxt Plugin] Browser logs plugin initializing...');
  
  // Use Nuxt's $fetch to test the endpoint
  const testEndpoint = async () => {
    try {
      const response = await $fetch('/__client-logs', {
        method: 'POST',
        body: {
          sessionId: 'test-nuxt',
          entries: [{
            level: 'info',
            text: '[Nuxt Plugin Test] Testing endpoint connectivity',
            time: Date.now()
          }]
        }
      });
      console.log('[Nuxt Plugin] Endpoint test successful');
    } catch (err) {
      console.error('[Nuxt Plugin] Endpoint test failed:', err);
    }
  };
  
  // Import the virtual module after a small delay to ensure Vite is ready
  setTimeout(async () => {
    try {
      await import('virtual:browser-logs-to-terminal');
      console.log('[Nuxt Plugin] Virtual module imported successfully');
      
      // Test the endpoint
      await testEndpoint();
      
      // Test a real log
      console.log('[Nuxt Plugin] If you see this in the terminal, the plugin is working!');
    } catch (err) {
      console.error('[Nuxt Plugin] Failed to import virtual module:', err);
    }
  }, 100);
});
