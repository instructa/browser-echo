import * as React from 'react'

export function DevLogDemo() {
  const emitAll = React.useCallback(() => {
    console.log('log:', 'Hello from TanStack app')
    console.info('info:', { msg: 'Structured info', time: new Date().toISOString() })
    console.warn('warn:', 'This is a warning with number', 123)
    console.debug('debug:', 'Some debug details', { feature: 'logging' })

    const circular: any = { name: 'circular' }
    circular.self = circular
    const big = 42n
    const fn = function sampleFn() {}
    const sym = Symbol('demo')
    console.log('objects:', { circular, big, fn, sym })
  }, [])

  const emitError = React.useCallback(() => {
    console.error(new Error('Boom from TanStack!'))
  }, [])

  const testNetworkRequests = React.useCallback(async () => {
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
  }, [])

  React.useEffect(() => {
    emitAll()
    emitError()
  }, [emitAll, emitError])

  return (
    <div style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button
        onClick={emitAll}
        style={{ padding: '6px 10px', border: '1px solid #999', borderRadius: 6 }}
      >
        Emit All Logs
      </button>
      <button
        onClick={emitError}
        style={{ padding: '6px 10px', border: '1px solid #999', borderRadius: 6 }}
      >
        Emit Error
      </button>
      <button
        onClick={testNetworkRequests}
        style={{ padding: '6px 10px', border: '1px solid #999', borderRadius: 6 }}
      >
        Test Network Requests
      </button>
    </div>
  )
}
