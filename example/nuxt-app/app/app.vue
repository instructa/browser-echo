<script setup lang="ts">
import { onMounted } from 'vue'

function emitAll() {
  console.log('log:', 'Hello from Nuxt app')
  console.info('info:', { msg: 'Structured info', time: new Date().toISOString() })
  console.warn('warn:', 'This is a warning with number', 123)
  console.debug('debug:', 'Some debug details', { feature: 'logging' })

  const circular: any = { name: 'circular' }
  circular.self = circular
  const big = 42n
  const fn = function sampleFn() {}
  const sym = Symbol('demo')
  console.log('objects:', { circular, big, fn, sym })
}

function emitError() {
  const err = new Error('Boom from Nuxt!')
  console.error(err)
}

onMounted(() => {
  emitAll()
  emitError()
})
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />

    <div style="padding: 12px; display: flex; gap: 8px; flex-wrap: wrap">
      <button @click="emitAll" style="padding: 6px 10px; border: 1px solid #999; border-radius: 6px">
        Emit All Logs
      </button>
      <button @click="emitError" style="padding: 6px 10px; border: 1px solid #999; border-radius: 6px">
        Emit Error
      </button>
    </div>

    <!-- Render current route page -->
    <NuxtPage />
  </div>
</template>
