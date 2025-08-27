import { useState } from 'react'

export default function DevLogDemo() {
  const [count, setCount] = useState(0)

  const handleLogDemo = () => {
    console.log('📊 Regular log message from React component')
    console.warn('⚠️ Warning message with count:', count)
    console.error('❌ Error message for testing')
    console.info('ℹ️ Info message with object:', { count, timestamp: new Date() })
    
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

  const handleNetworkTest = async () => {
    console.log('🌐 Testing network requests...')

    try {
      // Test successful fetch
      await fetch('https://jsonplaceholder.typicode.com/posts/1')
      console.log('✅ Successful fetch completed')

      // Test POST request
      await fetch('https://jsonplaceholder.typicode.com/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test', body: 'Test body' })
      })
      console.log('✅ POST request completed')

      // Test 404 error
      await fetch('https://jsonplaceholder.typicode.com/posts/999999')
      console.log('⚠️ 404 request completed')

    } catch (error) {
      console.error('🌐 Network test error:', error)
    }
  }

  return (
    <div className="demo-section">
      <h2>Browser Echo Demo</h2>
      <p>Open your terminal running <code>npm run dev</code> to see logs streamed in real-time!</p>
      
      <div className="button-group">
        <button onClick={handleLogDemo}>
          Trigger Console Logs
        </button>
        
        <button onClick={handleAsyncError}>
          Test Async Error
        </button>
        
        <button onClick={handleNetworkTest}>
          Test Network Requests
        </button>
        
        <button onClick={() => {
          console.group('📂 Grouped logs')
          console.log('Message 1 in group')
          console.warn('Message 2 in group')
          console.error('Message 3 in group')
          console.groupEnd()
        }}>
          Test Grouped Logs
        </button>
      </div>

      <div className="count-section">
        <p>Count: {count}</p>
        <button onClick={() => {
          const newCount = count + 1
          setCount(newCount)
          console.log(`🔢 Counter updated to: ${newCount}`)
        }}>
          Increment (+Log)
        </button>
      </div>
    </div>
  )
}