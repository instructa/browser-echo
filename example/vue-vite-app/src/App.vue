<template>
  <div>
    <a href="https://vite.dev" target="_blank">
      <img src="/vite.svg" class="logo" alt="Vite logo" />
    </a>
    <a href="https://vuejs.org/" target="_blank">
      <img src="./assets/vue.svg" class="logo vue" alt="Vue logo" />
    </a>
  </div>
  <h1>Vue + Vite + Browser Echo</h1>

  <HelloWorld msg="Vite + Vue" />
  
  <DevLogDemo />
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import HelloWorld from './components/HelloWorld.vue'
import DevLogDemo from './components/DevLogDemo.vue'

onMounted(() => {
  console.log('🚀 Vue + Vite app initialized with Browser Echo!')
  console.info('Main App component mounted, ready for development')
})
</script>

<style scoped>
.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}
.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}
.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}
</style>