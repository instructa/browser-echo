<template>
  <div class="demo-container">
    <h1>Browser Echo Nuxt Demo</h1>
    <p>Open your server terminal to see browser logs!</p>
    
    <div class="button-group">
      <button @click="testConsoleLog">Test console.log</button>
      <button @click="testConsoleInfo">Test console.info</button>
      <button @click="testConsoleWarn">Test console.warn</button>
      <button @click="testConsoleError">Test console.error</button>
      <button @click="testConsoleDebug">Test console.debug</button>
      <button @click="testComplexObject">Test Complex Object</button>
      <button @click="testMultipleArgs">Test Multiple Arguments</button>
      <button @click="testBatchLogging">Test Batch Logging</button>
      <button @click="testNetworkRequests">Test Network Requests</button>
    </div>

    <div class="info">
      <p>Click the buttons above to generate different types of console output.</p>
      <p>The logs will appear in your server terminal with the [web] prefix.</p>
    </div>
  </div>
</template>

<script setup>
const testConsoleLog = () => {
  console.log('This is a regular console.log message from Nuxt app');
};

const testConsoleInfo = () => {
  console.info('This is an info message with useful information');
};

const testConsoleWarn = () => {
  console.warn('This is a warning message - something might be wrong');
};

const testConsoleError = () => {
  console.error('This is an error message - something went wrong!');
};

const testConsoleDebug = () => {
  console.debug('This is a debug message with detailed information');
};

const testComplexObject = () => {
  const complexObject = {
    user: {
      id: 123,
      name: 'John Doe',
      email: 'john@example.com',
      preferences: {
        theme: 'dark',
        language: 'en',
        notifications: true
      }
    },
    timestamp: new Date().toISOString(),
    metadata: {
      version: '1.0.0',
      environment: 'development'
    }
  };
  console.log('Complex object:', complexObject);
};

const testMultipleArgs = () => {
  console.log('Multiple', 'arguments', 'in', 'one', 'log', { key: 'value' }, [1, 2, 3]);
};

const testBatchLogging = () => {
  console.log('Batch log 1: Starting batch test');
  console.info('Batch log 2: Processing...');
  console.warn('Batch log 3: Almost done');
  console.log('Batch log 4: Batch complete');
  console.log('These logs might be batched together for efficiency');
};

const testNetworkRequests = async () => {
  console.log('🌐 Testing network requests...');

  try {
    // Test successful fetch
    await fetch('https://jsonplaceholder.typicode.com/posts/1');
    console.log('✅ Successful fetch completed');

    // Test POST request
    await fetch('https://jsonplaceholder.typicode.com/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test', body: 'Test body' })
    });
    console.log('✅ POST request completed');

    // Test 404 error
    await fetch('https://jsonplaceholder.typicode.com/posts/999999');
    console.log('⚠️ 404 request completed');

  } catch (error) {
    console.error('🌐 Network test error:', error);
  }
};

// Log on component mount
console.log('DevLogDemo component mounted in Nuxt app');
</script>

<style scoped>
.demo-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}

h1 {
  font-size: 2rem;
  margin-bottom: 1rem;
  color: #00dc82;
}

p {
  margin-bottom: 1rem;
  color: #666;
}

.button-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 2rem 0;
}

button {
  padding: 0.5rem 1rem;
  background-color: #00dc82;
  color: white;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background-color 0.2s;
}

button:hover {
  background-color: #00a862;
}

.info {
  margin-top: 2rem;
  padding: 1rem;
  background-color: #f3f4f6;
  border-radius: 0.5rem;
}

.info p {
  margin: 0.5rem 0;
  font-size: 0.875rem;
}
</style>
