import { createFileRoute } from '@tanstack/react-router'
import { DevLogDemo } from '../components/DevLogDemo'
import { MatrixBackground } from '../components/MatrixBackground'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-200">
      <MatrixBackground />
      <div className="relative p-8">
        <header className="text-center mb-10">
          <h1 className="text-5xl font-bold text-white font-mono tracking-tight">
            BROWSER ECHO
          </h1>
          <p className="mt-2 text-sm text-yellow-400 font-mono uppercase tracking-widest">
            Dev Log Demo • Network & Console
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <span className="px-3 py-1 border border-yellow-500/40 text-yellow-300 rounded-sm text-xs font-mono">
              Console Logs
            </span>
            <span className="px-3 py-1 border border-yellow-500/40 text-yellow-300 rounded-sm text-xs font-mono">
              Network Capture
            </span>
            <span className="px-3 py-1 border border-yellow-500/40 text-yellow-300 rounded-sm text-xs font-mono">
              Error Tracking
            </span>
          </div>
        </header>

        <div className="max-w-4xl mx-auto">
          <div className="bg-black/60 rounded-sm border border-yellow-500/40 p-6">
            <div className="mb-4 text-yellow-300 font-mono text-xs">
              ~/dev/browser-echo-demo
            </div>
            
            <DevLogDemo />
          </div>

          <footer className="mt-10 text-center text-gray-400 font-mono text-xs">
            <p>Open your terminal to see logs</p>
            <p className="mt-1">
              <span className="text-yellow-400">[browser]</span> console • 
              <span className="text-yellow-400 ml-2">[network]</span> http/ws • 
              <span className="text-yellow-400 ml-2">[error]</span> exceptions
            </p>
          </footer>
        </div>
      </div>
    </div>
  )
}
