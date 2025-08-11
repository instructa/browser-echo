<template>
  <div class="demo-section">
    <h2>Browser Echo Demo</h2>
    <p>Open your terminal running <code>npm run dev</code> to see logs streamed in real-time!</p>
    
    <div class="button-group">
      <button @click="handleLogDemo">
        Trigger Console Logs
      </button>
      
      <button @click="handleAsyncError">
        Test Async Error
      </button>
      
      <button @click="handleGroupedLogs">
        Test Grouped Logs
      </button>
    </div>

    <div class="count-section">
      <p>Count: {{ count }}</p>
      <button @click="incrementCount">
        Increment (+Log)
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const count = ref(0)

onMounted(() => {
  console.log('🚀 Vue + Vite app initialized with Browser Echo!')
  console.info('DevLogDemo component mounted')
})

const handleLogDemo = () => {
  console.log('📊 Regular log message from Vue component')
  console.warn('⚠️ Warning message with count:', count.value)
  console.error('❌ Error message for testing')
  console.info('ℹ️ Info message with object:', { count: count.value, timestamp: new Date() })
  
  try {
    throw new Error('Demo error with stack trace')
  } catch (error) {
    console.error('🔥 Caught error:', error)
  }
}

const handleAsyncError = async () => {
  console.log('🔄 Starting async operation...')
  
  try {
    await new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Async operation failed')), 100)
    })
  } catch (error) {
    console.error('💥 Async error caught:', error)
  }
}

const handleGroupedLogs = () => {
  console.group('📂 Grouped logs')
  console.log('Message 1 in group')
  console.warn('Message 2 in group')
  console.error('Message 3 in group')
  console.groupEnd()
}

const incrementCount = () => {
  count.value++
  console.log(`🔢 Counter updated to: ${count.value}`)
}
</script>