<template>
  <div style="padding: 20px">
    <h1>Browser Logs Test Page</h1>
    
    <div style="margin: 20px 0">
      <button 
        @click="testBasicLogs" 
        style="margin-right: 10px; padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer"
      >
        Test Basic Logs
      </button>
      
      <button 
        @click="testError" 
        style="margin-right: 10px; padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer"
      >
        Test Error
      </button>
      
      <button 
        @click="testComplexObjects" 
        style="padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer"
      >
        Test Complex Objects
      </button>
    </div>
    
    <div style="margin-top: 20px; padding: 10px; background: #f8f9fa; border-radius: 4px">
      <p>Open your browser console and terminal to see the logs.</p>
      <p>Logs triggered: {{ logCount }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const logCount = ref(0)

function testBasicLogs() {
  console.log('Basic log message from Nuxt')
  console.info('Info message with timestamp:', new Date().toISOString())
  console.warn('Warning: This is a test warning')
  console.debug('Debug info:', { component: 'test-logs', action: 'testBasicLogs' })
  logCount.value += 4
}

function testError() {
  try {
    throw new Error('Test error from Nuxt app')
  } catch (err) {
    console.error('Caught error:', err)
  }
  logCount.value += 1
}

function testComplexObjects() {
  const circular = { name: 'circular' }
  circular.self = circular
  
  console.log('Complex objects:', {
    bigInt: 123456789012345678901234567890n,
    symbol: Symbol('nuxt-test'),
    function: function namedFunction() { return 'test' },
    circular,
    nested: {
      level1: {
        level2: {
          level3: 'deep value'
        }
      }
    }
  })
  logCount.value += 1
}

onMounted(() => {
  console.log('[Test Page] Mounted - if you see this in terminal, the plugin is working!')
})
</script>
