import * as React from 'react'

export function DevLogDemo() {
  const [isLoading, setIsLoading] = React.useState(false)
  const [networkStatus, setNetworkStatus] = React.useState<string>('')

  const emitConsoleLogs = React.useCallback(() => {
    console.log('Console log test from TanStack app')
    console.info('Structured info:', { 
      timestamp: new Date().toISOString(), 
      userAgent: navigator.userAgent.split(' ')[0],
      feature: 'browser-echo-v1.1.0'
    })
    console.warn('Warning with data:', { level: 'warning', code: 123, details: 'This is a test warning' })
    console.debug('Debug details:', { 
      environment: 'development', 
      framework: 'TanStack Start',
      logging: true 
    })

    // Test complex objects
    const circular: any = { name: 'circular-ref', type: 'test' }
    circular.self = circular
    const bigInt = 42n
    const fn = function sampleFunction() { return 'test' }
    const sym = Symbol('browser-echo-demo')
    console.log('Complex objects:', { circular, bigInt, fn, sym, date: new Date() })
  }, [])

  const emitError = React.useCallback(() => {
    console.error('Error test:', new Error('Simulated error from TanStack demo'))
    
    // Test different error types
    try {
      throw new TypeError('Type error simulation')
    } catch (err) {
      console.error('Caught TypeError:', err)
    }
  }, [])

  const testNetworkLogs = React.useCallback(async () => {
    setIsLoading(true)
    setNetworkStatus('Testing network capture...')
    
    try {
      // Test different HTTP methods and responses
      console.log('Starting network tests...')
      
      // GET request with JSON response
      const response1 = await fetch('https://jsonplaceholder.typicode.com/posts/1')
      const data1 = await response1.json()
      console.log('Fetched post data:', data1.title)
      
      // POST request with JSON body
      const response2 = await fetch('https://jsonplaceholder.typicode.com/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Browser Echo Test',
          body: 'Testing network capture v1.1.0',
          userId: 1
        })
      })
      const data2 = await response2.json()
      console.log('Posted data, got ID:', data2.id)
      
      // Test error response
      try {
        await fetch('https://jsonplaceholder.typicode.com/posts/999999')
      } catch (err) {
        console.warn('Network error handled:', err)
      }
      
      setNetworkStatus('Network tests completed')
    } catch (error) {
      console.error('Network test failed:', error)
      setNetworkStatus('Network tests failed')
    } finally {
      setIsLoading(false)
      setTimeout(() => setNetworkStatus(''), 3000)
    }
  }, [])

  const testWebSocket = React.useCallback(() => {
    console.log('Testing WebSocket connection...')
    
    try {
      const ws = new WebSocket('wss://echo.websocket.org/')
      
      ws.onopen = () => {
        console.log('WebSocket connected')
        ws.send(JSON.stringify({ 
          type: 'test', 
          message: 'Hello from Browser Echo!',
          timestamp: Date.now()
        }))
      }
      
      ws.onmessage = (event) => {
        console.log('WebSocket message received:', event.data)
        ws.close()
      }
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }
      
      ws.onclose = () => {
        console.log('WebSocket connection closed')
      }
    } catch (error) {
      console.error('WebSocket test failed:', error)
    }
  }, [])

  const runFullTest = React.useCallback(async () => {
    console.clear()
    console.log('=== BROWSER ECHO v1.1.0 FULL TEST SUITE ===')
    
    emitConsoleLogs()
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    emitError()
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    await testNetworkLogs()
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    testWebSocket()
    
    console.log('=== TEST SUITE COMPLETED ===')
  }, [emitConsoleLogs, emitError, testNetworkLogs, testWebSocket])

  // Auto-run on mount
  React.useEffect(() => {
    const timer = setTimeout(() => {
      emitConsoleLogs()
    }, 1000)
    return () => clearTimeout(timer)
  }, [emitConsoleLogs])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Console Logs Section */}
        <div className="space-y-3">
          <h3 className="text-yellow-400 font-mono text-lg flex items-center gap-2">
            <span className="w-2 h-2 bg-yellow-400 rounded-sm"></span>
            Console Logs
          </h3>
          <div className="space-y-2">
            <button
              onClick={emitConsoleLogs}
              className="w-full px-4 py-3 border border-yellow-500/40 text-white font-mono text-sm rounded-sm hover:bg-yellow-500/10 transition-colors"
            >
              Test Console Logs
            </button>
            <button
              onClick={emitError}
              className="w-full px-4 py-3 border border-yellow-500/40 text-white font-mono text-sm rounded-sm hover:bg-yellow-500/10 transition-colors"
            >
              Test Error Logs
            </button>
          </div>
        </div>

        {/* Network Logs Section */}
        <div className="space-y-3">
          <h3 className="text-yellow-400 font-mono text-lg flex items-center gap-2">
            <span className="w-2 h-2 bg-yellow-400 rounded-sm"></span>
            Network Capture
          </h3>
          <div className="space-y-2">
            <button
              onClick={testNetworkLogs}
              disabled={isLoading}
              className="w-full px-4 py-3 border border-yellow-500/40 text-white font-mono text-sm rounded-sm hover:bg-yellow-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Testing...' : 'Test HTTP Requests'}
            </button>
            <button
              onClick={testWebSocket}
              className="w-full px-4 py-3 border border-yellow-500/40 text-white font-mono text-sm rounded-sm hover:bg-yellow-500/10 transition-colors"
            >
              Test WebSocket
            </button>
          </div>
        </div>
      </div>

      {/* Status Display */}
      {networkStatus && (
        <div className="px-4 py-2 bg-yellow-500/10 text-yellow-300 font-mono text-sm rounded-sm border border-yellow-500/30">
          {networkStatus}
        </div>
      )}

      {/* Full Test Suite */}
      <div className="pt-4 border-t border-gray-700">
        <button
          onClick={runFullTest}
          className="w-full px-6 py-4 bg-black text-white font-mono text-lg rounded-sm border border-yellow-500/40 hover:bg-yellow-500/10 transition-colors"
        >
          RUN FULL TEST SUITE
        </button>
      </div>

      <div className="text-center text-gray-300 font-mono text-xs">
        <p>Open your terminal to see all logs streaming in real-time</p>
        <p className="mt-1">Including <span className="text-yellow-400">[network]</span> requests with body capture</p>
      </div>
    </div>
  )
}
