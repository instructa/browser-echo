<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtWelcome />
    <div style="padding: 12px; display: flex; gap: 8px; flex-wrap: wrap">
      <button @click="emitAll" style="padding: 6px 10px; border: 1px solid #999; border-radius: 6px">
        Emit All Logs
      </button>
      <button @click="emitError" style="padding: 6px 10px; border: 1px solid #999; border-radius: 6px">
        Emit Error
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
const emitAll = () => {
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

const emitError = () => {
  console.error(new Error('Boom from Nuxt!'))
}

onMounted(() => {
  emitAll()
  emitError()
})
</script>
