<script setup lang="ts">
import { ref } from 'vue';
import { Droplets } from 'lucide-vue-next';

defineProps<{
  src: string;
  alt: string;
  className?: string;
}>();

const failed = ref(false);
</script>

<template>
  <div
    v-if="failed || !src"
    :class="['flex flex-col items-center justify-center bg-zinc-100 text-zinc-400', className]"
    :aria-label="alt"
  >
    <Droplets class="h-6 w-6 stroke-[1.5]" />
  </div>
  <img
    v-else
    :src="src"
    :alt="alt"
    referrerPolicy="no-referrer"
    @error="failed = true"
    :class="['object-cover', className]"
  />
</template>
